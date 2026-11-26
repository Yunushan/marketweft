# Provider history fixtures

Open **Import CSV**, choose **Provider history fixture** as the input format, then select a JSON packet. The packet supplies its instrument identity, provider, source grant and OHLCV CSV. Use fixtures for local testing with synthetic or authorized data.

```json
{
  "format": "marketweft-provider-history",
  "version": 1,
  "provider": "synthetic-sample",
  "venue": "DEMO",
  "symbol": "ALFA",
  "barInterval": "1 day",
  "grant": "Synthetic fixture agreement 1",
  "adjustmentPolicy": "Raw OHLCV",
  "permissions": {
    "display": "granted",
    "storage": "granted",
    "redistribution": "restricted",
    "automatedUse": "unconfirmed",
    "expiresOn": "2099-12-31"
  },
  "csv": "time,open,high,low,close,volume\n2025-06-02,10,12,9,11,500\n"
}
```

The identifier starts with a lowercase letter and uses lowercase ASCII letters or digits, with dots and hyphens between segments. The grant requires **Granted** display and storage status and an expiration date covering the device's current UTC day.

MarketWeft validates the packet, the grant and the embedded CSV before writing to the catalog. The history stores the provider identifier as its source and carries the exact permission statuses into workspace backups.

## Verify the embedded CSV

Use packet version 2 and add `csvSha256` with the 64-character lowercase SHA-256 digest of the decoded CSV's UTF-8 bytes. Compute the digest on the original CSV before embedding it in JSON. Preserve its line endings when creating the packet.

```sh
sha256sum bars.csv
```

The importer compares the digest before preparing the catalog update. A changed value or different line ending fails integrity verification. Version 1 fixtures use the original grant and CSV validation.
