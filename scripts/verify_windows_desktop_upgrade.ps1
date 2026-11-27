param(
    [Parameter(Mandatory)][ValidateSet('x64', 'arm64')][string]$Architecture,
    [Parameter(Mandatory)][string]$Candidate,
    [Parameter(Mandatory)][string]$CandidateBinary,
    [Parameter(Mandatory)][string]$WorkRoot,
    [Parameter(Mandatory)][long]$BaselineRun,
    [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$BaselineCommit,
    [Parameter(Mandatory)][ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+$')][string]$BaselineVersion,
    [string]$Driver,
    [string]$CandidateSmoke
)

$ErrorActionPreference = 'Stop'
if (($Architecture -eq 'x64' -and !$Driver) -or ($Architecture -eq 'arm64' -and !$CandidateSmoke)) {
    throw 'Provide the x64 Edge driver or the ARM64 candidate test executable.'
}
$repository = (git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not locate the project checkout.' }
$newRevision = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Could not identify the candidate source revision.' }
$version = (Get-Content -Raw package.json | ConvertFrom-Json).version
if ([version]$version -le [version]$BaselineVersion) { throw 'The candidate must be newer than the baseline.' }
$scratch = Join-Path (Resolve-Path -LiteralPath $WorkRoot).Path ('marketweft-windows-upgrade-' + [Guid]::NewGuid().ToString('N'))
$archive = Join-Path $scratch 'baseline'
$profileDirectory = Join-Path $scratch 'profile'
$installDirectory = Join-Path $scratch 'installed terminal'
$installed = Join-Path $installDirectory 'marketweft-desktop.exe'
$source = Join-Path $scratch 'baseline-source'
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\MarketWeft'
$shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'MarketWeft.lnk'
$marker = Join-Path $installDirectory 'user-created.txt'
$markerText = 'preserve this file across installer upgrades'
if ((Test-Path -LiteralPath $key) -or (Test-Path -LiteralPath $shortcut)) {
    throw 'The upgrade fixture requires a Windows account without an existing MarketWeft installation.'
}
New-Item -ItemType Directory -Path $profileDirectory -Force | Out-Null
try {
    python -B scripts/download_desktop_baseline.py --platform windows --architecture $Architecture --run $BaselineRun --commit $BaselineCommit --version $BaselineVersion --output $archive
    $downloadStatus = $LASTEXITCODE
} finally {
    Remove-Item Env:GITHUB_TOKEN -ErrorAction SilentlyContinue
}
if ($downloadStatus -notin @(0, 42)) { throw 'The verified baseline archive could not be obtained.' }

if ($downloadStatus -eq 42 -or $Architecture -eq 'arm64') {
    git init --quiet $source
    if ($LASTEXITCODE -ne 0) { throw 'Could not initialize the baseline checkout.' }
    git -C $source fetch --no-tags --depth 1 https://github.com/Yunushan/marketweft.git $BaselineCommit
    if ($LASTEXITCODE -ne 0) { throw 'Could not fetch the pinned baseline source.' }
    git -C $source checkout --detach FETCH_HEAD
    if ($LASTEXITCODE -ne 0 -or (git -C $source rev-parse HEAD) -cne $BaselineCommit) {
        throw 'The checked-out baseline source does not match its pinned revision.'
    }
    Push-Location -LiteralPath $source
    try {
        npm ci
        if ($LASTEXITCODE -ne 0) { throw 'Could not install the baseline frontend dependencies.' }
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Could not build the baseline frontend.' }
        $baselineBinary = 'apps/desktop/target/release/marketweft-desktop.exe'
        if ($downloadStatus -eq 42) {
            cargo build --locked --release --manifest-path apps/desktop/Cargo.toml
            if ($LASTEXITCODE -ne 0) { throw 'Could not rebuild the verified baseline release.' }
            $compiler = (Get-Command makensis.exe -ErrorAction SilentlyContinue).Source
            if (!$compiler) { $compiler = Join-Path ${env:ProgramFiles(x86)} 'NSIS\makensis.exe' }
            python -B scripts/package_desktop_windows.py $baselineBinary --architecture $Architecture --compiler $compiler --output $archive
            if ($LASTEXITCODE -ne 0) { throw 'Could not rebuild the verified baseline installer.' }
        }
        if ($Architecture -eq 'arm64') {
            # Overlay only the CI fixture onto the exact baseline application and frontend.
            foreach ($relative in @('apps/desktop/src/native_smoke.rs', 'apps/desktop/tests/import_native_fixture.js')) {
                Copy-Item -LiteralPath (Join-Path $repository $relative) -Destination (Join-Path $source $relative) -Force
            }
            cargo build --locked --release --manifest-path apps/desktop/Cargo.toml --features native-smoke
            if ($LASTEXITCODE -ne 0) { throw 'Could not build the prior ARM64 workspace fixture.' }
            $baselineSmoke = (Resolve-Path -LiteralPath $baselineBinary).Path
        }
    } finally {
        Pop-Location
    }
}

function Install-VerifiedVersion([string]$Setup, [string]$ExpectedVersion, [string]$ExpectedCommit) {
    $installer = (Resolve-Path -LiteralPath $Setup).Path
    $process = Start-Process -FilePath $installer -ArgumentList "/S /D=$installDirectory" -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Installation of $ExpectedVersion failed with exit code $($process.ExitCode)." }
    $registration = Get-ItemProperty -LiteralPath $key
    $revision = Get-Content -LiteralPath (Join-Path $installDirectory 'source-revision.txt')
    if ($registration.DisplayVersion -cne $ExpectedVersion -or $registration.InstallLocation -ne $installDirectory -or $revision -cne $ExpectedCommit) {
        throw "Registration or source identity did not match the $ExpectedVersion installer."
    }
    python -B scripts/verify_windows_arch.py $Architecture $installed
    if ($LASTEXITCODE -ne 0) { throw 'The installed executable has an unexpected architecture.' }
}

function Wait-WebViewProfileRelease {
    $pattern = [regex]::Escape($profileDirectory)
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while (Get-CimInstance -ClassName Win32_Process -Filter "Name = 'msedgewebview2.exe'" |
        Where-Object { $_.CommandLine -match $pattern }) {
        if ([DateTime]::UtcNow -ge $deadline) { throw 'The fixture WebView2 process did not release the shared profile.' }
        Start-Sleep -Milliseconds 250
    }
}

$baseline = Join-Path $archive "MarketWeft-desktop-$BaselineVersion-windows-$Architecture-setup.exe"
try {
    Install-VerifiedVersion $baseline $BaselineVersion $BaselineCommit
    Set-Content -LiteralPath $marker -Value $markerText
    foreach ($phase in @('seed', 'reopen')) {
        if ($Architecture -eq 'x64') {
            python -B apps/desktop/tests/import_webview.py $installed --driver $Driver --workspace $profileDirectory --phase $phase
            if ($LASTEXITCODE -ne 0) { throw "The installed baseline failed its $phase check." }
        } else {
            & "$PSScriptRoot/invoke_native_windows_smoke.ps1" -Binary $baselineSmoke -WebViewProfile $profileDirectory -LogDirectory $scratch -Phase $phase
        }
        Wait-WebViewProfileRelease
    }
    Install-VerifiedVersion $Candidate $version $newRevision
    if ((Get-FileHash -LiteralPath $installed -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $CandidateBinary -Algorithm SHA256).Hash) {
        throw 'The upgraded executable does not match the candidate binary.'
    }
    if ((Get-Content -LiteralPath $marker) -cne $markerText) { throw 'The upgrade changed the user-created file.' }
    if ($Architecture -eq 'x64') {
        python -B apps/desktop/tests/import_webview.py $installed --driver $Driver --workspace $profileDirectory --phase reopen
        if ($LASTEXITCODE -ne 0) { throw 'The upgraded installation could not reopen the saved workspace.' }
    } else {
        & "$PSScriptRoot/invoke_native_windows_smoke.ps1" -Binary $CandidateSmoke -WebViewProfile $profileDirectory -LogDirectory $scratch -Phase reopen
    }
    Wait-WebViewProfileRelease
} finally {
    $uninstaller = Join-Path $installDirectory 'Uninstall.exe'
    if (Test-Path -LiteralPath $uninstaller -PathType Leaf) {
        $copy = Join-Path $scratch 'verified-upgrade-uninstaller.exe'
        Copy-Item -LiteralPath $uninstaller -Destination $copy
        $result = Start-Process -FilePath $copy -ArgumentList "/S _?=$installDirectory" -WindowStyle Hidden -Wait -PassThru
        if ($result.ExitCode -ne 0) { throw "Upgrade fixture cleanup failed with exit code $($result.ExitCode)." }
    }
}
if ((Test-Path -LiteralPath $key) -or (Test-Path -LiteralPath $shortcut) -or (Get-Content -LiteralPath $marker) -cne $markerText) {
    throw 'Upgrade fixture cleanup changed the user file or left installed registration.'
}
Write-Output "Verified the Windows $Architecture upgrade from $BaselineVersion to $version and the saved WebView2 workspace."
