param(
    [Parameter(Mandatory)][string]$Binary,
    [Parameter(Mandatory)][string]$Driver,
    [Parameter(Mandatory)][string]$WorkRoot,
    [string]$Output = 'reports'
)

$ErrorActionPreference = 'Stop'
$version = (Get-Content -Raw package.json | ConvertFrom-Json).version
$revision = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$compiler = (Get-Command makensis.exe -ErrorAction SilentlyContinue).Source
if (!$compiler) { $compiler = Join-Path ${env:ProgramFiles(x86)} 'NSIS\makensis.exe' }
if (!(Test-Path -LiteralPath $compiler -PathType Leaf)) { throw 'The NSIS compiler is unavailable.' }

$scratch = Join-Path (Resolve-Path -LiteralPath $WorkRoot).Path ('marketweft-windows-installer-' + [Guid]::NewGuid().ToString('N'))
$installDirectory = Join-Path $scratch 'installed terminal'
$independent = Join-Path $scratch 'reproduction'
$name = "MarketWeft-desktop-$version-windows-x64-setup.exe"
$first = Join-Path $Output $name
$second = Join-Path $independent $name
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\MarketWeft'
$shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'MarketWeft.lnk'
if ((Test-Path -LiteralPath $key) -or (Test-Path -LiteralPath $shortcut)) {
    throw 'Verification requires a Windows account without an existing MarketWeft installation.'
}

foreach ($destination in @($Output, $independent)) {
    python -B scripts/package_desktop_windows.py $Binary --compiler $compiler --output $destination
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
$digest = (Get-FileHash -LiteralPath $first -Algorithm SHA256).Hash.ToLowerInvariant()
$reproduced = (Get-FileHash -LiteralPath $second -Algorithm SHA256).Hash.ToLowerInvariant()
$expected = "$digest  $name"
if ($digest -ne $reproduced -or (Get-Content -LiteralPath "$first.sha256") -cne $expected -or (Get-Content -LiteralPath "$second.sha256") -cne $expected) {
    throw 'The installer bytes or SHA-256 manifests differ.'
}
Write-Output "Reproduced the Windows installer with SHA-256 $digest."

$installer = (Resolve-Path -LiteralPath $first).Path
$installed = Join-Path $installDirectory 'marketweft-desktop.exe'
$uninstaller = Join-Path $installDirectory 'Uninstall.exe'
$sentinel = Join-Path $installDirectory 'user-created.txt'
try {
    $result = Start-Process -FilePath $installer -ArgumentList "/S /D=$installDirectory" -WindowStyle Hidden -Wait -PassThru
    if ($result.ExitCode -ne 0) { throw "Installation failed with exit code $($result.ExitCode)." }
    $record = Get-ItemProperty -LiteralPath $key
    if ($record.DisplayVersion -cne $version -or $record.InstallLocation -ne $installDirectory -or !(Test-Path -LiteralPath $shortcut -PathType Leaf)) {
        throw 'The installer registration or Start menu shortcut differs from the installed application.'
    }
    $originalHash = (Get-FileHash -LiteralPath $Binary -Algorithm SHA256).Hash
    $installedHash = (Get-FileHash -LiteralPath $installed -Algorithm SHA256).Hash
    if ($installedHash -ne $originalHash -or (Get-Content -LiteralPath (Join-Path $installDirectory 'source-revision.txt')) -cne $revision) {
        throw 'The installed binary or recorded source revision differs from the verified build.'
    }
    $licenses = Join-Path $installDirectory 'licenses'
    foreach ($notice in @('marketweft-0bsd.txt', 'third-party-notices.txt', 'web-notices.txt', 'rust-library-notices.html', 'dependencies.cdx.json', 'cargo-sources.json')) {
        if (!(Test-Path -LiteralPath (Join-Path $licenses $notice) -PathType Leaf)) { throw "Missing installed notice $notice." }
    }
    $crates = Get-Content -LiteralPath (Join-Path $licenses 'cargo-sources.json') -Raw | ConvertFrom-Json
    if (!($crates | Where-Object { $_.name -eq 'webview2-com' -and $_.license -eq 'MIT' })) {
        throw 'The native Windows dependency source inventory lacks the WebView2 bindings.'
    }
    python -B apps/desktop/tests/import_webview.py $installed --driver $Driver
    if ($LASTEXITCODE -ne 0) { throw 'Native WebView2 verification through the installed executable failed.' }
    Set-Content -LiteralPath $sentinel -Value 'user-created workspace marker'
} finally {
    if (Test-Path -LiteralPath $uninstaller -PathType Leaf) {
        $copy = Join-Path $scratch 'verified-marketweft-uninstaller.exe'
        Copy-Item -LiteralPath $uninstaller -Destination $copy
        $result = Start-Process -FilePath $copy -ArgumentList "/S _?=$installDirectory" -WindowStyle Hidden -Wait -PassThru
        if ($result.ExitCode -ne 0) { throw "Uninstallation failed with exit code $($result.ExitCode)." }
    }
}
if ((Test-Path -LiteralPath $key) -or (Test-Path -LiteralPath $shortcut)) {
    throw 'Uninstallation left MarketWeft registration or the Start menu shortcut.'
}
$remaining = @(Get-ChildItem -LiteralPath $installDirectory -Force)
if ($remaining.Count -ne 1 -or $remaining[0].FullName -ne $sentinel) {
    throw 'Uninstallation did not remove exactly the installed files and preserve the user-created file.'
}
Write-Output "Verified clean Windows x64 installation, installed WebView2 import and uninstallation of $version."
