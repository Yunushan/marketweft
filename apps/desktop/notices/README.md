# Desktop dependency notices

Some locked Cargo workspace packages omit their shared license file from the published crate. The desktop package uses the following original repository files and checks the crate’s recorded source revision before including them.

| Cargo package | Original file | Git blob |
| --- | --- | --- |
| alloc-stdlib 0.3.0 | [Dropbox allocator BSD-3-Clause](https://github.com/dropbox/rust-alloc-no-stdlib/blob/0a81fd6928ea3b33c8cd484aa4575d50ffb98012/LICENSE) | cd496ba72eb37e83a44958358d1f89a8a28cbc15 |
| dlopen2 0.8.2 and dlopen2_derive 0.4.3 | [Dlopen2 workspace MIT](https://github.com/OpenByteDev/dlopen2/blob/cc80e4a0a90d499b677fdf7743699b4b3a43a989/LICENSE) | d38093a7a564c64ad15e459f2e0a1f86a443c8b3 |
| webview2-com 0.39.1, webview2-com-sys 0.39.1 and webview2-com-macros 0.8.1 | [WebView2 bindings MIT](https://github.com/wravery/webview2-rs/blob/edc2caf886175ccaebe86078c9cfe1ae2a187328/LICENSE) · [callback macros MIT](https://github.com/wravery/webview2-rs/blob/dffa41a8a46d3f5565eefbff2de57d38d399f158/LICENSE) | de9a7e660e173136b351982a34f715af424ff812 |

The libappindicator-sys package shares its terms with the matching libappindicator crate from the same source revision. The selectors files declare MPL-2.0 in their headers. The package includes the MPL-2.0 text shipped with the locked cssparser crate, plus exact source URLs and hashes for both packages.

The locked macOS objc2 runtime crates declare MIT or offer MIT as an alternative. Their published archives omit standalone LICENSE files. The bundle records the locked crate checksums and source references, and includes the upstream objc2 MIT notice and the inherited rust-objc MIT notice. The packager checks each crate's recorded source revision and license declaration before applying these notices. [objc2 license and attribution](https://github.com/madsmtm/objc2/blob/b98d2a3e0f7b7adf83cf12c16e834752f16b0b51/LICENSE.md) · [objc2 MIT notice](https://github.com/madsmtm/objc2/blob/b98d2a3e0f7b7adf83cf12c16e834752f16b0b51/LICENSE-MIT.txt) · [rust-objc MIT notice](https://github.com/SSheldon/rust-objc/blob/c8696b0cd1932fdf1b5b22c03af86f32a934f42f/LICENSE.txt).
