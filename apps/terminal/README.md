# Browser terminal import limits

Set these variables in the environment of `npm run build` or `npm run dev`. Vite embeds the resulting policy in the terminal bundle. A desktop wrapper or static server serving that bundle uses the same policy. Rebuild and redeploy to change it.

| Variable | Default | Largest accepted value | Measurement |
| --- | ---: | ---: | --- |
| `VITE_MARKETWEFT_IMPORT_MAX_BYTES` | 1,500,000 | 8,388,608 | Original file bytes, including the header, line endings and any UTF-8 BOM |
| `VITE_MARKETWEFT_IMPORT_MAX_BARS` | 100,000 | 100,000 | Nonblank data rows after the header |

For example, this PowerShell build admits files up to 500,000 bytes and 5,000 bars.

```powershell
$env:VITE_MARKETWEFT_IMPORT_MAX_BYTES = '500000'
$env:VITE_MARKETWEFT_IMPORT_MAX_BARS = '5000'
npm run build
```

Values accept positive base-10 integers in digits only, with no leading zero, unit suffix, sign or thousands separator. Unset variables use their defaults. Invalid, empty or oversized values fail build and development-server startup.

The import dialog shows the effective limits. It checks file size before reading and checks row count before sending the CSV to Rust. These limits apply to each newly selected user file. Sample histories and previously saved imports remain readable after a deployment lowers its limits. Browser storage quotas still apply when saving a workspace.
