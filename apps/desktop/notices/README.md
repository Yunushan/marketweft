# Desktop dependency notices

Some locked Cargo workspace packages omit their shared license file from the published crate. The desktop package uses the following original repository files and checks the crate’s recorded source revision before including them.

| Cargo package | Original file | Git blob |
| --- | --- | --- |
| alloc-stdlib 0.3.0 | [Dropbox allocator BSD-3-Clause](https://github.com/dropbox/rust-alloc-no-stdlib/blob/0a81fd6928ea3b33c8cd484aa4575d50ffb98012/LICENSE) | cd496ba72eb37e83a44958358d1f89a8a28cbc15 |
| dlopen2 0.8.2 and dlopen2_derive 0.4.3 | [Dlopen2 workspace MIT](https://github.com/OpenByteDev/dlopen2/blob/cc80e4a0a90d499b677fdf7743699b4b3a43a989/LICENSE) | d38093a7a564c64ad15e459f2e0a1f86a443c8b3 |

The libappindicator-sys package shares its terms with the matching libappindicator crate from the same source revision. The selectors files declare MPL-2.0 in their headers. The package includes the MPL-2.0 text shipped with the locked cssparser crate, plus exact source URLs and hashes for both packages.
