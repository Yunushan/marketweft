param(
    [Parameter(Mandatory)][string]$Binary,
    [Parameter(Mandatory)][string]$WebViewProfile,
    [Parameter(Mandatory)][string]$LogDirectory,
    [ValidateSet('import', 'seed', 'reopen')][string]$Phase = 'import'
)

$ErrorActionPreference = 'Stop'
$logRoot = (Resolve-Path -LiteralPath $LogDirectory).Path
$profileDirectory = (New-Item -ItemType Directory -Path $WebViewProfile -Force).FullName
$stdout = Join-Path $logRoot "native-webview-$Phase.log"
$stderr = Join-Path $logRoot "native-webview-$Phase-errors.log"
$process = Start-Process -FilePath $Binary -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr -Environment @{
    WEBVIEW2_USER_DATA_FOLDER = $profileDirectory
    MARKETWEFT_NATIVE_SMOKE_PHASE = $Phase
}
try {
    if (!$process.WaitForExit(60000)) {
        Stop-Process -InputObject $process
        $process.WaitForExit()
        throw "The Windows native WebView2 fixture timed out during $Phase."
    }
    Get-Content -LiteralPath $stdout, $stderr
    $expected = if ($Phase -eq 'import') {
        'Verified native WebView CSV import and exact OHLCV.'
    } else {
        "Verified native WebView workspace $Phase and exact OHLCV."
    }
    if ($process.ExitCode -ne 0 -or !(Select-String -LiteralPath $stdout -SimpleMatch $expected -Quiet)) {
        throw "The Windows native WebView2 fixture failed during $Phase."
    }
} finally {
    $process.Dispose()
}
