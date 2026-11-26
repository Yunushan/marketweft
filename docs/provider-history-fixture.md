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

## Verify a signed provider fixture

Use packet version 3 when you have a provider public key from a trusted source. In the import form, select the packet and its separate **Provider verification key or registry** file. A single key uses PEM SubjectPublicKeyInfo encoding for an ECDSA P-256 public key.

The signed message is the UTF-8 encoding of the packet's JSON fields except `csv` and `signature`. Sort object keys recursively in UTF-16 code-unit order and preserve array order. Serialize with JSON string escaping and without insignificant whitespace. The signed `csvSha256` field binds the message to the decoded CSV bytes. Use ECDSA with P-256 and SHA-256 and encode the concatenated 32-byte `r` and 32-byte `s` values as unpadded base64url in `signature`. [Web Cryptography ECDSA specification](https://www.w3.org/TR/webcrypto/#ecdsa).

Selecting a public key requires a signed version 3 packet. The importer checks the key, provider, grant, signature and CSV digest before a catalog write.

## Provider verification records

The catalog shows the SHA-256 fingerprint of the verified public key's DER SubjectPublicKeyInfo and the digest of the verified CSV. Both digests travel with the source rights in series descriptor version 3 and workspace backup version 8.

Restore checks the archived CSV against its recorded provider digest before preparing the workspace replacement. The key fingerprint records which public key verified the fixture at import.

## Provider key registry

The verification input also accepts an operator-supplied JSON registry with `format` set to `marketweft-provider-key-registry`, `version` set to `1`, and a `keys` array. Each entry contains the `provider` identifier and its P-256 public key in `pem`. Choose a registry from a trusted source. It can contain up to 32 keys, with up to four keys per provider.

During a key rotation, include the existing and replacement public keys under the same provider identifier. Remove the retired key from the registry when its acceptance period ends. The importer checks only keys listed under the fixture's signed provider identifier and records the fingerprint of the key that verified the packet.
