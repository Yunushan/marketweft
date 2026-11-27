param(
    [Parameter(Mandatory)][ValidateSet('x64', 'arm64')][string]$Architecture,
    [Parameter(Mandatory)][string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$runtimeId = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
$locations = @(
    "HKCU:\Software\Microsoft\EdgeUpdate\Clients\$runtimeId"
    "HKLM:\Software\WOW6432Node\Microsoft\EdgeUpdate\Clients\$runtimeId"
)
$versions = @(foreach ($location in $locations) {
    $value = Get-ItemPropertyValue -LiteralPath $location -Name pv -ErrorAction SilentlyContinue
    if ($value -match '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' -and $value -ne '0.0.0.0') {
        [version]$value
    }
})
if ($versions.Count -eq 0) {
    throw 'The WebView2 Runtime did not report an installed version.'
}
$runtimeVersion = $versions | Sort-Object -Descending | Select-Object -First 1
Write-Host "Installed WebView2 Runtime $runtimeVersion"

$directory = (New-Item -ItemType Directory -Path $OutputDirectory -Force).FullName
$zip = Join-Path $directory 'edgedriver.zip'
$driver = Join-Path $directory 'msedgedriver.exe'
$asset = @{ x64 = 'edgedriver_win64.zip'; arm64 = 'edgedriver_arm64.zip' }[$Architecture]
$url = "https://msedgedriver.microsoft.com/$runtimeVersion/$asset"
Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip -TimeoutSec 45 -MaximumRedirection 0

$archive = [IO.Compression.ZipFile]::OpenRead($zip)
try {
    $entry = $archive.GetEntry('msedgedriver.exe')
    if (!$entry) { throw 'The Microsoft archive lacks the WebDriver executable.' }
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $driver, $true)
} finally {
    $archive.Dispose()
}
$signature = Get-AuthenticodeSignature -LiteralPath $driver
$driverVersion = (Get-Item -LiteralPath $driver).VersionInfo.ProductVersion
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'CN=Microsoft Corporation(?:,|$)' -or $driverVersion -ne "$runtimeVersion") {
    throw 'The downloaded WebDriver did not match the requested Microsoft-signed version.'
}
Write-Output $driver
