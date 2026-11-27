param(
    [Parameter(Mandatory)][string]$Binary,
    [ValidateSet('x64', 'arm64')][string]$Architecture = 'x64',
    [string]$Driver,
    [string]$SmokeBinary,
    [Parameter(Mandatory)][string]$WorkRoot,
    [string]$Output = 'reports'
)

$ErrorActionPreference = 'Stop'
if (($Architecture -eq 'x64' -and !$Driver) -or ($Architecture -eq 'arm64' -and !$SmokeBinary)) {
    throw 'Provide the Edge driver for x64 or the separate native-smoke executable for ARM64.'
}
$version = (Get-Content -Raw package.json | ConvertFrom-Json).version
$revision = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$compiler = (Get-Command makensis.exe -ErrorAction SilentlyContinue).Source
if (!$compiler) { $compiler = Join-Path ${env:ProgramFiles(x86)} 'NSIS\makensis.exe' }
if (!(Test-Path -LiteralPath $compiler -PathType Leaf)) { throw 'The NSIS compiler is unavailable.' }

$scratch = Join-Path (Resolve-Path -LiteralPath $WorkRoot).Path ('marketweft-windows-installer-' + [Guid]::NewGuid().ToString('N'))
$independent = Join-Path $scratch 'reproduction'
$name = "MarketWeft-desktop-$version-windows-$Architecture-setup.exe"
$first = Join-Path $Output $name
$second = Join-Path $independent $name
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\MarketWeft'
$shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'MarketWeft.lnk'
if ((Test-Path -LiteralPath $key) -or (Test-Path -LiteralPath $shortcut)) {
    throw 'Verification requires a Windows account without an existing MarketWeft installation.'
}

foreach ($destination in @($Output, $independent)) {
    python -B scripts/package_desktop_windows.py $Binary --architecture $Architecture --compiler $compiler --output $destination
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
$digest = (Get-FileHash -LiteralPath $first -Algorithm SHA256).Hash.ToLowerInvariant()
$reproduced = (Get-FileHash -LiteralPath $second -Algorithm SHA256).Hash.ToLowerInvariant()
$expected = "$digest  $name"
if ($digest -ne $reproduced -or (Get-Content -LiteralPath "$first.sha256") -cne $expected -or (Get-Content -LiteralPath "$second.sha256") -cne $expected) {
    throw 'The installer bytes or SHA-256 manifests differ.'
}
Write-Output "Reproduced the Windows installer with SHA-256 $digest."

function Test-InstalledPackage([string]$Setup, [string]$SourceBinary, [string]$Directory, [scriptblock]$CheckWebView) {
    $installer = (Resolve-Path -LiteralPath $Setup).Path
    New-Item -ItemType Directory -Path $Directory -Force | Out-Null
    $installDirectory = Join-Path $Directory 'installed terminal'
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
        $originalHash = (Get-FileHash -LiteralPath $SourceBinary -Algorithm SHA256).Hash
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
        & $CheckWebView $installed $Directory
        Set-Content -LiteralPath $sentinel -Value 'user-created workspace marker'
    } finally {
        if (Test-Path -LiteralPath $uninstaller -PathType Leaf) {
            $copy = Join-Path $Directory 'verified-marketweft-uninstaller.exe'
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
}

if ($Architecture -eq 'x64') {
    Test-InstalledPackage $first $Binary (Join-Path $scratch 'release') {
        param($Installed)
        python -B apps/desktop/tests/import_webview.py $Installed --driver $Driver
        if ($LASTEXITCODE -ne 0) { throw 'Native WebView2 verification through the installed executable failed.' }
    }
} else {
    Test-InstalledPackage $first $Binary (Join-Path $scratch 'release') {
        param($Installed, $Directory)
        $webviewProfile = Join-Path $Directory 'release-profile'
        $state = Join-Path $webviewProfile 'EBWebView\Local State'
        $process = Start-Process -FilePath $Installed -WindowStyle Hidden -PassThru -Environment @{ WEBVIEW2_USER_DATA_FOLDER = $webviewProfile }
        try {
            $deadline = [DateTime]::UtcNow.AddSeconds(45)
            while (!(Test-Path -LiteralPath $state -PathType Leaf)) {
                if ($process.HasExited) { throw "The installed ARM64 application exited with code $($process.ExitCode)." }
                if ([DateTime]::UtcNow -ge $deadline) { throw 'The installed ARM64 application did not initialize WebView2.' }
                Start-Sleep -Milliseconds 250
            }
            if ($process.HasExited) { throw 'The installed ARM64 application stopped during WebView2 initialization.' }
            Write-Output 'The installed ARM64 release executable initialized WebView2.'
        } finally {
            if (!$process.HasExited -and (!$process.CloseMainWindow() -or !$process.WaitForExit(5000))) {
                Stop-Process -InputObject $process
                $process.WaitForExit()
            }
            $process.Dispose()
        }
    }
    $smoke = Join-Path $scratch 'smoke-package'
    python -B scripts/package_desktop_windows.py $SmokeBinary --architecture $Architecture --compiler $compiler --output $smoke
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Test-InstalledPackage (Join-Path $smoke $name) $SmokeBinary (Join-Path $scratch 'smoke') {
        param($Installed, $Directory)
        $webviewProfile = Join-Path $Directory 'smoke-profile'
        $stdout = Join-Path $Directory 'native-smoke.log'
        $stderr = Join-Path $Directory 'native-smoke-errors.log'
        $process = Start-Process -FilePath $Installed -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr -Environment @{ WEBVIEW2_USER_DATA_FOLDER = $webviewProfile }
        try {
            if (!$process.WaitForExit(60000)) {
                Stop-Process -InputObject $process
                $process.WaitForExit()
                throw 'The installed ARM64 test build timed out.'
            }
            Get-Content -LiteralPath $stdout, $stderr
            if ($process.ExitCode -ne 0 -or !(Select-String -LiteralPath $stdout -SimpleMatch 'Verified native WebView CSV import and exact OHLCV.' -Quiet)) {
                throw 'The installed ARM64 test build did not verify its WebView2 import.'
            }
        } finally {
            $process.Dispose()
        }
    }
}
Write-Output "Verified clean Windows $Architecture installation, installed WebView2 import and uninstallation of $version."
