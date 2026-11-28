<!-- MarketWeft README · locale=id -->

# MarketWeft

**0.293.0 · 0BSD**

**Bahasa dokumentasi**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · **Bahasa Indonesia** · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## Kemampuan MarketWeft

MarketWeft adalah terminal riset lokal untuk analis, pengembang, dan operator. Terminal membuka OHLCV yang diizinkan, menampilkan kandil dan volume, menghitung SMA dan EMA dengan titik tetap, dan menyimpan daftar pantauan, instrumen, serta indikator di IndexedDB. Aplikasi berjalan luring setelah aset tersimpan. Harga dan volume bawaan bersifat sintetis dan tidak memerlukan akun penyedia.

MarketWeft 0.293.0 menampilkan simpangan baku bergulir yang presisi untuk harga penutupan teramati, dengan pengaturan per panel dan CSV riset. MarketWeft 0.7.0 menambah pemeringkatan anggota semesta berdasarkan imbal hasil harga yang diketahui pada waktu kueri. Pemutaran ulang berbasis sesi mencakup pemecahan saham, dividen tunai, keanggotaan, dan penghapusan pencatatan. Repositori juga menyediakan pengamat TypeScript hanya-baca untuk layanan trading-bot terpisah dan pembungkus Tauri eksperimental. Umpan penyedia, pesanan, penginstal bertanda tangan, dan hosting multipengguna masih dalam peta jalan.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md) · [Close Standard Deviation](../chart-workspace.md#close-standard-deviation) · [Equity target research SDKs](../portfolio-replay.md#equity-target-research-sdks)

<!-- section:02 -->
## Memulai terminal portabel

Unduh browser-terminal-attempt-N dari verifikasi GitHub yang berhasil. Ekstrak MarketWeft-browser-0.293.0.zip. Simpan dist/ di samping serve-terminal.mjs lalu jalankan perintah di folder itu. Buka http://127.0.0.1:4173/ dengan peramban yang mendukung WebAssembly, Canvas, BigInt, dan IndexedDB. Pakai Node.js 22.12 atau lebih baru. Instalasi npm tidak diperlukan. Tunggu Offline ready sebelum memutus koneksi.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md) · [Linux native verification](../../docs/platforms.md#linux-native-verification) · [Ubuntu desktop package](../../docs/platforms.md#ubuntu-desktop-package) · [Ubuntu upgrade verification](../../docs/platforms.md#verify-an-ubuntu-package-upgrade) · [Ubuntu package provenance](../../docs/platforms.md#verify-ubuntu-package-provenance)

<!-- section:03 -->
## Memutar ulang contoh NYSE

Di Historical replay pilih Start demo. Next event maju, Previous event mundur, Play dan Pause mengontrol pemutaran, serta Reset mengosongkan riwayat tampilan. Grafik mulai kosong. Kandil muncul saat interval berakhir. Event time adalah awal interval atau batas sesi. Observed at menunjukkan ketersediaan. Kecepatan hanya mengubah laju tampilan.

Pembukaan bergeser dari 13:30 UTC (UTC−04:00) pada 31 Oktober 2025 ke 14:30 UTC (UTC−05:00) pada 3 November. Interval 15:00 yang hilang dilaporkan pukul 15:30. Hari Thanksgiving tidak memiliki slot. Pada 28 November sesi tutup lebih awal pukul 18:00 UTC setelah tujuh kandil 30 menit. Contoh memuat 20 sesi, 253 kandil, dan 294 peristiwa, dengan data sintetis dan jam publik NYSE.

Buka Historical replay → Start split demo lalu ganti Price basis antara Raw dan Split-adjusted pada peristiwa yang sama. Pemecahan 2 banding 1 diumumkan dan diamati sebelum berlaku. Kedua tampilan setara hingga saat itu. Saat berlaku, penutupan terakhir sebelumnya berubah dari 106.50 mentah menjadi 53.25 setelah penyesuaian dan volumenya dua kali lipat. Kandil berikutnya tetap 53.00. Untuk data sendiri, unggah Corporate actions CSV instrumen terpilih, konfirmasi OHLCV mentah, dan masukkan kalender sesi. Rasio terakhir yang teramati diterapkan setelah berlaku. Laporan terlambat dan koreksi mengubah tampilan mulai saat teramati. Riwayat sumber tetap utuh.

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

Buka Historical replay → Start dividend demo untuk mengikuti 100 saham yang berhak per distribusi. Tanggal ex menimbulkan piutang USD 25.00. Revisi menaikkannya menjadi USD 30.00 dan jadwal baru menunda kredit. Laporan terlambat mengkredit EUR 10.00 saat teramati. Koreksi setelah pembayaran menyisakan USD 28.00. Mundur untuk melihat saldo terdahulu. Untuk data sendiri, unggah Cash dividends CSV dan isi Entitled shares per distribution. Gunakan ID distribusi yang sama untuk revisi. Buku besar memisahkan mata uang serta menjaga transaksi terdahulu dan harga sumber.

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

Buka Historical replay → Open universe replay → Start universe demo. Pada 14:05 UTC hanya ALFA menjadi anggota dan BETA masuk pada 14:10. Pengeluaran ALFA yang berlaku pada 14:20 diketahui pada 14:25. Delisting BETA pada 14:30 diketahui pada 14:35. Mundur untuk melihat anggota terdahulu atau kueri dengan Effective time dan Known time terpisah. Unggah Universe membership CSV untuk data sendiri. Pertahankan ID perubahan saat revisi dan bedakan ID pencatatan ketika ticker dipakai ulang.

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

Di Universe screen pilih Load demo prices dengan waktu dasar 14:00 UTC. ALFA memimpin dengan 1% pada 14:05. BETA masuk pada 14:10 dan belum berperingkat sampai penutupannya diketahui pukul 14:12. Kueri waktu efektif 14:10 dengan waktu diketahui 14:12 lalu 14:16 untuk membandingkan imbal hasil BETA sebesar 12% dan hasil revisi 1%. ALFA keluar dari kueri efektif 14:20 ketika penghapusannya diketahui pukul 14:25. Unggah Universe prices CSV dengan ID pencatatan dan waktu penutupan yang tepat. Anggota tanpa harga dasar atau target tetap terlihat tanpa peringkat.

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

Setelah memuat harga demo, pilih Load demo sectors di Sector heatmap. Pada 14:10 UTC peta mencakup 60% bobot yang diketahui. Saat harga BETA diketahui pada 14:12, cakupan naik menjadi 100% dan kontribusi teramati naik dari 1,2% menjadi 6%. Revisi pada 14:16 memindahkan BETA dari Financials ke Technology. Buka petak untuk melihat peringkat, kontribusi, dan waktu klasifikasi. Unggah Sector and weight CSV untuk data sendiri.

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

Buka Historical replay → Open financial statements → Start financial demo. Original filing menampilkan P/E 10×. Pada waktu valuasi yang sama, Restatement observed menaikkan P/E menjadi 15× dan menunjukkan ekuitas biasa tidak tersedia. Revised capitalization menaikkan P/E menjadi 20×. Unggah Annual filings CSV dan Capitalization CSV opsional untuk mencari penerbit dan batas waktu pengetahuan Anda.

```csv
issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow
DEMO-ALFA,ALFA-FY24-A1,2024-01-01,2024-12-31,2025-04-03T14:15:00Z,2025-04-03T14:20:00Z,USD,8000000000,800000000,,-250000000
```

```csv
issuer_id,source_id,valuation_at,observed_at,currency,market_cap
DEMO-ALFA,ALFA-CAP,2025-04-03T14:00:00Z,2025-04-03T14:01:00Z,USD,12000000000
```

Buka Historical replay → Open economic calendar → Start calendar demo. Sebelum rilis, prakiraan 2,5% dan angka aktual belum tersedia. Actual observed menunjukkan 2,7% pada 14:32 UTC. Revised actual menunjukkan 2,8%, dan kedua revisi tercatat dalam Release evidence. Unggah Macro calendar CSV untuk rilis bertanggal milik Anda.

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

Buka Historical replay → Open option chain → Start option demo. Pasangan April dengan strike 100 dimulai dengan IV sekitar 20%. Late option quote menampilkan call strike 90 dengan IV 25% dan Corrected spread memulihkan perhitungan put. Buka Implied volatility surface untuk membandingkan jatuh tempo. Gunakan Underlying CSV dan Option quotes CSV untuk data sendiri.

```csv
underlying,currency,quote_at,observed_at,spot,rate,dividend_yield
DEMO:OPT,USD,2025-04-03T13:59:00Z,2025-04-03T13:59:00Z,100,0.03,0.01
```

```csv
contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask
APR-C100,DEMO:OPT,USD,call,2026-04-03T14:00:00Z,100,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,8.807321,8.847321
```

Buka Historical replay → Open replay alerts → Start alert demo. First crossing menampilkan satu peringatan ambang. Correction observed menampilkan sampel revisi dan persilangannya terhadap rata-rata bergerak. Full alert replay menampilkan delapan peringatan. Pilih Save to alert inbox dua kali untuk menyimpan delapan catatan pada kali pertama dan nol yang baru pada kali kedua. Muat Alert rules CSV dan Alert observations CSV untuk data sendiri.

```csv
rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand
LEVEL,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5
```

```csv
observation_id,series_id,measured_at,observed_at,value
O2,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:02:00Z,6
```

Buka Historical replay → Open paper ledger → Start paper demo. Maju dari cadangan 503 ke pengisian parsial tunggal yang menyisakan kas 801,6. Final account menampilkan kas 663,7 dan laba terealisasi 13 setelah penghentian. Gunakan Paper events CSV untuk data simulasi Anda.

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

Buka Historical replay → Open bar backtest → Start backtest demo. Sinyal 14:05 UTC menempatkan pesanan beli. Interval 14:06 yang hilang tidak menghasilkan pengisian. Penutupan 14:07 memungkinkan dua saham terisi. Final backtest menunjukkan ekuitas 957,8. Gunakan CSV sesi dan bar untuk riwayat lokal.

Pada demo uji balik, jalankan Walk-forward validation dengan enam bar pelatihan dan dua bar pengujian. Jendela lengkap pertama tampil pada 14:09 UTC. Pasangan 1:2 terpilih dari pelatihan dan tetap digunakan pada dua bar pengujian yang dimulai dengan akun baru.

Pada demo uji balik, jalankan Seeded scenarios dengan seed 20250403, 256 jalur, dan delapan pergerakan per jalur. Ekuitas akhir acuan adalah 957,8 dan median skenario 997,6. Batas waktu, masukan, dan seed yang sama menghasilkan tabel risiko yang sama.

Dalam demo semesta, muat Delisting proceeds untuk BETA-001 dan isi kedua batas waktu dengan 14:35 UTC untuk melihat hasil yang belum tersedia. Pada 14:37, sepuluh saham menghasilkan piutang 70 USD, yang dibukukan sebagai kas pada 14:50. Koreksi menjaga hasil sebelumnya dan memisahkan BETA-002.

Buka Start split revisions demo dan pilih Split-adjusted. Pada 3 Juni pukul 14:10 UTC, revisi waktu efektif menarik penyesuaian sebelumnya. Pukul 14:20, dua faktor diterapkan bersama. Pembatalan SPLIT-A pukul 14:30 mempertahankan SPLIT-B dan bar mentah.

Buka Start dividend entitlement demo. ALPHA mulai dengan 100 saham berhak dan naik ke 120 ketika laporan terlambat tiba. BETA menggunakan 40 saham. Koreksi ALPHA menjadi 110 saham membalik 3 USD setelah pembayaran. Putar ulang ke belakang untuk melihat saldo sebelumnya.

Dalam demo semesta, muat Portfolio replay. Harga penutupan BETA-001 pukul 14:10 UTC baru terlihat pada batas pengetahuan 14:12. Pukul 14:45, piutang 70 USD terpisah dari nilai saham BETA-002 sebesar 225 EUR. Pukul 14:50, nilai saham dan kas delisting berjumlah 284 USD.

Pilih Compare charts lalu pilih instrumen pembanding. Link by UTC menyorot waktu tampak yang sama di kedua panel. Perbesar setiap panel secara terpisah. Cadangan ruang kerja menyimpan instrumen, indikator, dan pengaturan tautan.

Pilih Draw measurement lalu tentukan bar UTC yang tersedia dan harga untuk setiap ujung. Garis tersimpan digambar ulang saat grafik diperbesar atau digeser. Cadangan ruang kerja menyimpan koordinatnya. Aplikasi menampilkan selisih waktu dalam detik serta perubahan harga dan persentasenya.

Buka Indicators dan atur periode SMA dan EMA dalam jumlah bar untuk tiap panel. Setelah harga penutupan mencukupi, grafik menampilkan nilai untuk bar UTC yang dipilih. Periode tetap tersimpan ketika instrumen diganti, halaman dimuat ulang, atau cadangan dipulihkan.

Buka Export CSV di bawah grafik. Unduh bar OHLCV untuk diimpor ulang atau sertakan informasi sumber dan rata-rata bergerak yang aktif untuk riset. Kolom rata-rata kosong sampai harga penutupan mencukupi.

Pilih Close line pada pemilih jenis grafik di salah satu panel. Garis memakai harga penutupan yang tercatat dan tetap menampilkan volume serta indikator aktif. Bar UTC yang tidak tersedia tidak menerima garis silang tertaut. Cadangan menyimpan jenis grafik yang dipilih.

Pilih OHLC bars untuk melihat harga tertinggi dan terendah pada garis vertikal, pembukaan di kiri, dan penutupan di kanan. Setiap panel menyimpan jenis grafiknya, dan kursor tertaut mengikuti waktu UTC yang tepat.

Buka Timeframe di salah satu panel dan masukkan interval sumber dan sasaran dalam detik. Grafik dan CSV riset menunjukkan cakupan yang teramati. Cadangan menyimpan seri asli.

Tambahkan CSV kalender sesi di Timeframe. Interval dimulai dari pembukaan tiap sesi dan interval terakhir berakhir pada waktu penutupan yang tercantum. CSV riset mencatat kalender dan cakupan sumber.

Buka Recorded tick bars lalu pilih jumlah transaksi dan batas waktu pengamatan. Grafik mempertahankan urutan rekaman pada waktu yang sama, menandai bar parsial, dan mengekspor batas urutannya secara tepat.

Di Portfolio replay, muat demo dividen atau tambahkan CSV. Kueri menggunakan posisi sebelum tanggal ex, menyelesaikan pada tanggal bayar, dan menerapkan revisi sesuai waktu pengamatan.

Seusai memuat harga, buka Relative returns di Universe screen. Pilih dua ID pencatatan dan waktu acuan UTC yang tepat. Ubah batas waktu semesta untuk melihat penutupan yang hilang dan revisinya, lalu unduh perbandingan lengkap sebagai CSV.

Buka Recorded market depth dan muat CSV kedalaman untuk instrumen terpilih. Telusuri batas pengamatan untuk melihat tingkat bid dan ask, celah urutan, serta pemulihan pada snapshot berikutnya. Unduh semua tingkat sebagai CSV.

Buka Recorded footprint dan muat transaksi instrumen terpilih. Atur jendela eksekusi dan batas pengamatan untuk melihat volume beli, jual, dan tidak diketahui per rentang harga. Unduh footprint lengkap dan delta kumulatif dalam CSV.

Setelah menjalankan kueri di Recorded footprint, buka Price profiles. Bandingkan volume per harga dengan jumlah interval waktu yang mencatat transaksi di setiap rentang harga. Tetapkan target area nilai dan unduh seluruh profil sebagai CSV.

Buka Rolling risk di bawah Relative returns. Atur interval UTC, panjang jendela, dan skala volatilitas untuk memeriksa imbal hasil yang tersedia dan jumlah sampel berpasangan. Unduh seluruh hasil bergulir sebagai CSV.

Setelah memuat harga di Universe screen, buka Correlated portfolio scenarios. Atur bobot pencatatan, seed, dan biaya penyeimbangan ulang. Periksa cakupan imbal hasil lengkap dan persentil jalur, lalu unduh setiap jalur sebagai CSV.

Di Universe screen, buka Cross-sectional paper replay dan muat laporan likuiditas. Atur keputusan pertama dan pemeringkatan. Periksa pilihan, order, kas, dan nilai transaksi atau unduh hasil pemutaran ulang lengkap sebagai CSV.

Di Cross-sectional paper replay, buka Corporate cash reports dan muat CSV yang sesuai. Jalankan simulasi untuk memeriksa hak, revisi pembayaran, posisi yang dipulihkan, dan bukti kas. Unduh catatan kas dalam format CSV.

Di Bar backtest, buka Recorded trade execution dan muat CSV transaksi. Atur batas waktu efektif dan waktu diketahui untuk memeriksa pengisian parsial, ID rekaman yang tepat, kas, dan ekuitas. Unduh riwayat lengkap dalam CSV.

Setelah menjalankan replay pemeringkatan, buka Cross-sectional walk-forward. Bandingkan periode historis dan jumlah efek, periksa pengujian terpisah serta penilaian yang belum lengkap, lalu ekspor skor dan sumber sebagai CSV.

Pilih grafik dan buka Time-series formulas. Masukkan ekspresi OHLCV dan batas observasi, lalu periksa nilai presisi dan baris yang tidak tersedia. Ekspor formula, sumber, versi bahasa, dan hasil sebagai CSV.

Muat riwayat bar dan buka Formula paper backtest. Atur dua ekspresi dan dua batas waktu. Bandingkan eksekusi dari volume bar dan rekaman transaksi, periksa sinyal yang kosong dan ekspor bukti sebagai CSV.

Unduh paket dari backtest formula yang berhasil. Muat di ruang kerja lain untuk memulihkan kedua formula, mode eksekusi, dan pengaturan akun yang tepat. Ulangi hasil dengan data dan batas waktu yang sama.

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [Rank comparison](../../docs/universe-screen.md#compare-ranks-at-two-cutoffs) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [Sector heatmap comparison](../../docs/sector-heatmap.md#compare-heatmaps-at-two-cutoffs) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md) · [split-revisions.csv](../../crates/core/tests/fixtures/synthetic-split-revisions.csv) · [dividend-positions.csv](../../crates/core/tests/fixtures/synthetic-dividend-positions.csv) · [portfolio-replay.md](../../docs/portfolio-replay.md) · [portfolio-holdings.csv](../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [chart-workspace.md](../../docs/chart-workspace.md) · [relative-returns.md](../../docs/relative-returns.md) · [recorded-depth.md](../../docs/recorded-depth.md) · [recorded-footprint.md](../../docs/recorded-footprint.md) · [price-profiles.md](../../docs/price-profiles.md) · [listing-risk.md](../../docs/listing-risk.md) · [portfolio-scenarios.md](../../docs/portfolio-scenarios.md) · [cross-sectional-paper.md](../../docs/cross-sectional-paper.md) · [paper-corporate-cash.md](../../docs/paper-corporate-cash.md) · [recorded-trade-execution.md](../../docs/recorded-trade-execution.md) · [cross-sectional-walk-forward.md](../../docs/cross-sectional-walk-forward.md) · [time-series-language.md](../../docs/time-series-language.md) · [formula-paper-backtest.md](../../docs/formula-paper-backtest.md) · [formula-strategy-packages.md](../../docs/formula-strategy-packages.md) · [formula-walk-forward.md](../../docs/formula-walk-forward.md) · [formula-functions.md](../../docs/formula-functions.md) · [TypeScript SDK](../../packages/research/README.md) · [Python SDK](../../packages/python-research/README.md) · [MCP](../local-mcp-research.md) · [Research screen](../research-universe-screen.md) · [Rank comparison APIs](../research-universe-screen.md#compare-rank-snapshots) · [Local REST](../local-rest-research.md) · [REST rank comparison](../local-rest-research.md#compare-universe-ranks) · [Rank comparison stream](../local-rest-research.md#stream-rank-comparisons) · [gRPC rank comparison](../local-rest-research.md#rank-comparisons-over-grpc) · [WebSocket](../local-rest-research.md#websocket-streaming) · [gRPC](../local-rest-research.md#grpc-research) · [SQLite audit](../local-rest-research.md#sqlite-audit-receipts) · [Audit recovery](../local-rest-research.md#audit-backup-and-recovery) · [Concurrency](../local-rest-research.md#concurrency-and-retries) · [Managed credentials](../local-rest-research.md#managed-research-credentials) · [Localhost TLS](../local-rest-research.md#localhost-tls) · [Private research](../local-rest-research.md#private-interface-research) · [Research OCI image](../local-rest-research.md#research-oci-image) · [Docker Compose](../local-rest-research.md#private-docker-compose-deployment) · [Kubernetes](../local-rest-research.md#private-kubernetes-deployment) · [Health and metrics](../local-rest-research.md#loopback-health-and-metrics) · [Controlled shutdown](../local-rest-research.md#controlled-shutdown) · [Fresh-volume recovery](../local-rest-research.md#recover-audit-in-a-separate-compose-project) · [Audit snapshot verification](../local-rest-research.md#verify-a-portable-audit-snapshot) · [Restore with a SHA-256 digest](../local-rest-research.md#restore-with-a-trusted-sha-256-digest) · [Research readiness](../local-rest-research.md#research-readiness) · [Source permissions](../source-permissions.md) · [Chart export permission](../source-permissions.md#chart-csv-export) · [Formula use permission](../source-permissions.md#time-series-formulas) · [Formula export permission](../source-permissions.md#formula-csv-export) · [Provider history fixture](../provider-history-fixture.md) · [Provider CSV verification](../provider-history-fixture.md#verify-the-embedded-csv) · [Provider signature verification](../provider-history-fixture.md#verify-a-signed-provider-fixture) · [Provider verification records](../provider-history-fixture.md#provider-verification-records) · [Provider key registry](../provider-history-fixture.md#provider-key-registry) · [Provider key validity windows](../provider-history-fixture.md#provider-key-validity-windows) · [Provider revision replay](../provider-revisions.md) · [Provider bar withdrawals](../provider-revisions.md#withdraw-and-replace-a-bar) · [Provider replay chart](../provider-revisions.md#provider-replay-chart) · [Signed provider revisions](../provider-revisions.md#load-a-signed-provider-revision-fixture) · [Provider replay CSV](../provider-revisions.md#verify-the-source-and-download-the-replay) · [Quarterly financial filings](../financial-statements.md#quarterly-filings-and-trailing-twelve-months) · [Trailing valuation multiples](../financial-statements.md#choose-a-valuation-basis) · [Native financial snapshots](../../packages/python-research/README.md#financial-snapshots) · [MCP financial snapshots](../local-mcp-research.md#financial-snapshots) · [American exercise pricing](../option-chain.md#american-exercise-pricing) · [American implied volatility](../option-chain.md#american-implied-volatility) · [Discrete cash dividends](../option-chain.md#discrete-cash-dividends) · [Cash-dividend implied volatility](../option-chain.md#cash-dividend-implied-volatility) · [Native option snapshots](../../packages/python-research/README.md#option-chain-snapshots) · [Native American option valuations](../../packages/python-research/README.md#american-option-valuations) · [TypeScript option research](../../packages/research/README.md#option-snapshots-and-american-valuations) · [MCP option snapshots](../local-mcp-research.md#option-chain-snapshots) · [MCP American option valuations](../local-mcp-research.md#american-option-valuations) · [REST option snapshots](../local-rest-research.md#option-chain-snapshots) · [REST American option valuations](../local-rest-research.md#american-option-valuations) · [Option snapshots over WebSocket](../local-rest-research.md#option-snapshots-over-websocket) · [Option snapshots over gRPC](../local-rest-research.md#option-snapshots-over-grpc) · [American valuations over gRPC](../local-rest-research.md#american-valuations-over-grpc) · [Heikin-Ashi charts](../chart-workspace.md#heikin-ashi) · [Renko charts](../chart-workspace.md#renko) · [Three Line Break](../chart-workspace.md#three-line-break) · [Kagi charts](../chart-workspace.md#kagi) · [Point and Figure](../chart-workspace.md#point-and-figure) · [Recorded range bars](../chart-workspace.md#recorded-range-bars) · [Recorded volume bars](../chart-workspace.md#recorded-volume-bars) · [Wilder RSI](../chart-workspace.md#wilder-relative-strength-index) · [Wilder ATR](../chart-workspace.md#wilder-average-true-range) · [Bollinger Bands](../chart-workspace.md#bollinger-bands) · [Bollinger %B and BandWidth](../chart-workspace.md#bollinger-b-and-bandwidth) · [Donchian Channels](../chart-workspace.md#donchian-channels) · [Keltner Channels](../chart-workspace.md#keltner-channels) · [Stochastic Oscillator](../chart-workspace.md#stochastic-oscillator) · [Williams %R](../chart-workspace.md#williams-r) · [MACD](../chart-workspace.md#macd) · [On-Balance Volume and Accumulation/Distribution](../chart-workspace.md#cumulative-volume-studies) · [Chaikin studies](../chart-workspace.md#chaikin-studies) · [MFI and VWMA](../chart-workspace.md#money-flow-index-and-volume-weighted-moving-average) · [Directional Movement System](../chart-workspace.md#directional-movement-system) · [CCI and ROC](../chart-workspace.md#commodity-channel-index-and-rate-of-change) · [Aroon](../chart-workspace.md#aroon-and-aroon-oscillator) · [Price lines and UTC markers](../chart-workspace.md#horizontal-price-lines-and-utc-time-markers) · [Horizontal rays and trend lines](../chart-workspace.md#horizontal-rays-and-trend-lines) · [Rectangles and parallel channels](../chart-workspace.md#rectangles-and-parallel-channels) · [Polylines and Fibonacci retracements](../chart-workspace.md#polylines-and-fibonacci-retracements) · [Fibonacci price extensions](../chart-workspace.md#fibonacci-price-extensions) · [Fibonacci time zones](../chart-workspace.md#fibonacci-time-zones) · [Ellipses and triangles](../chart-workspace.md#ellipses-and-triangles) · [Chart notes and directional arrows](../chart-workspace.md#chart-notes-and-directional-arrows) · [Price and time ranges](../chart-workspace.md#price-and-time-range-highlights) · [Candlestick pattern replay](../candlestick-patterns.md) · [Candlestick pattern alerts](../replay-alerts.md#candlestick-pattern-alerts) · [Signed webhook delivery](../local-webhook-delivery.md) · [Webhook event export](../replay-alerts.md#export-a-webhook-event) · [Resume delivery](../local-webhook-delivery.md#resume-a-pending-delivery) · [Close area and step line](../chart-workspace.md#close-area-and-step-line) · [Baseline chart](../chart-workspace.md#baseline-chart) · [Close-change histogram](../chart-workspace.md#close-change-histogram) · [Volume-weighted candles](../chart-workspace.md#volume-weighted-candles) · [High-low band](../chart-workspace.md#high-low-band) · [Rebased percent change](../chart-workspace.md#rebased-percent-change) · [Peak-to-trough drawdown](../chart-workspace.md#peak-to-trough-drawdown) · [Confirmed close swings](../chart-workspace.md#confirmed-close-swings) · [Anchored VWAP](../chart-workspace.md#anchored-vwap) · [Pitchfork](../chart-workspace.md#pitchfork) · [Risk/reward drawing](../chart-workspace.md#riskreward-drawing) · [Regression channel](../chart-workspace.md#regression-channel)

<!-- section:04 -->
## Mengimpor dan memutar ulang data sendiri

Di Import CSV masukkan pasar dan simbol, lalu pilih OHLCV UTF-8 yang diizinkan. Urutkan detik Unix, tanggal UTC, atau waktu UTC berakhiran Z secara menaik. Gunakan paling banyak enam desimal, volume nonnegatif, dan nilai tertinggi dan terendah yang mencakup pembukaan dan penutupan. Satu baris tidak sah membatalkan impor. Catat interval, sumber, hak, dan penyesuaian di Series details.

Tandai kandil dengan waktu mulai. Di Historical replay pilih instrumen, kalender CSV, dan interval detik bulat (1–86.400). Tulis batas UTC, offset menit saat buka, dan regular atau early. Kisi berawal saat buka dan slot akhir dapat lebih singkat. Kandil di luar sesi atau kisi ditolak. Kekosongan memajukan jam dan mempertahankan nilai terakhir.

Batas baku adalah 1.500.000 byte dan 100.000 kandil per file. Konfigurasi build bisa mencapai 8 MiB dan 100.000 baris. Kalender menerima 1 MiB, 10.000 segmen tak tumpang tindih, dan 200.000 peristiwa. Kuota peramban berlaku terpisah.

```csv
time,open,high,low,close,volume
2025-11-28T14:30:00Z,10,12,9,11,200.000001
2025-11-28T15:00:00Z,11,13,10,12,150
```

```csv
date,open_utc,close_utc,utc_offset_minutes,kind
2025-11-28,2025-11-28T14:30:00Z,2025-11-28T18:00:00Z,-300,early
```

[apps/terminal/README.md](../../apps/terminal/README.md) · [crates/core/README.md](../../crates/core/README.md)

<!-- section:05 -->
## Mencadangkan, memindahkan, dan memulihkan

Workspace backup → Export workspace menyimpan JSON berversi berisi CSV asli, asal, riwayat tampak dan tersembunyi, urutan daftar, pilihan, serta indikator. Pada profil tujuan, pilih Backup file, periksa jumlah, dan tekan Restore workspace. Satu transaksi mengganti katalog tujuan. Ekspor tujuan terlebih dahulu jika perlu disimpan.

Pertahankan skema, host, port, dan profil saat memutakhirkan. Ruang 0.1.0 pindah ke IndexedDB, dibaca kembali untuk verifikasi, dan nilai lama disimpan. Tutup tab versi lama. Cadangan berupa teks biasa. SHA-256 memeriksa integritas. Ikuti hak data untuk penyimpanan, akses, dan retensi.

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## Arsitektur dan perhitungan

Rust memvalidasi identitas, UTC, dan OHLCV, berhitung dalam sepersejuta bilangan bulat, serta menyusun jadwal. React memakai mesin Wasm yang sama, Canvas, transaksi IndexedDB, dan service worker untuk cache. Revisi mendeteksi penulisan serentak. Keadaan terikat ke profil dan asal.

SMA memakai jumlah bergulir eksak. EMA dimulai pada jendela lengkap pertama dan dibulatkan setiap langkah ke sepersejuta, menjauhi nol saat seri. Pemutaran memakai harga penutupan yang sudah muncul. Akhir slot menentukan ketersediaan historis. Kedatangan dari penyedia, revisi, dan waktu dalam kandil butuh data lain. Baris sumber tetap utuh.

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## Penyebaran dan cakupan operasi

Sajikan dist/ melalui HTTPS atau gunakan peluncur loopback. Pertahankan asal untuk menemukan ruang kerja. Port, profil, atau jendela privat lain punya penyimpanan sendiri. Untuk mengevaluasi Tauri, bangun web dan pasang prasyarat sistem. CI membangun Windows Server 2022, macOS 15, dan Ubuntu 24.04 serta membuka jendela Linux. Matriks memuat seluler, ARM, dan BSD. Gunakan Chromium desktop untuk pengujian.

Model kini satu pengguna lokal per profil. Simpan data dan cadangan di perangkat resmi. Autentikasi, isolasi pengguna, pemantauan, retensi, dan target pemulihan perlu penerapan teruji sendiri. ZIP menyertakan pemberitahuan lisensi dan SBOM CycloneDX. Tag rilis menjalankan pengesahan artefak.

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## Mengamati layanan eksternal

TradingBotObserverV1 membaca runtime, status, account, dan portfolio dari trading-bot yang diatur terpisah. Gunakan asal tepercaya, HTTPS di luar loopback, dan token sah melalui konfigurasi proses. Tinjau waktu setiap pengamatan. Potret kosong atau layanan sehat tidak memberi saldo maupun posisi tambahan. Kredensial, order, dan eksekusi adalah tanggung jawab layanan eksternal.

```js
import { TradingBotObserverV1 } from "@marketweft/trading-bot";

const observer = new TradingBotObserverV1({
  baseUrl: process.env.TRADING_BOT_URL ?? "http://127.0.0.1:8000",
  token: process.env.TRADING_BOT_TOKEN,
});
const snapshot = await observer.account();
console.log(snapshot.observedAt, snapshot.totalBalance, snapshot.currency);
```

[docs/trading-bot.md](../../docs/trading-bot.md) · [trading-bot](https://github.com/Yunushan/trading-bot)

<!-- section:09 -->
## Membangun dan memverifikasi sumber

Pakai Node.js 22.12 atau baru dengan npm, Rustup sesuai rust-toolchain.toml, dan Python 3.11 atau baru. Jalankan dari akar repo. Vite mencetak URL pengembangan, biasanya 5173. Server produksi memakai 4173. Pasang Chromium terkunci sebelum uji.

Verifikasi mencakup Rust, Wasm, peramban, SDK, server lokal, lisensi, SBOM, dan advisori. Setiap peristiwa membandingkan kedua rata-rata dengan bagian awal hasil batch, termasuk pergantian jam, kekosongan, dan penutupan awal. CI menunggu ID ZIP yang tepat lalu mencocokkan byte unduhan. Tag yang cocok dengan versi memicu pengesahan.

```sh
git clone https://github.com/Yunushan/marketweft.git
cd marketweft
npm ci
npm run dev
```

```sh
node scripts/build-wasm.mjs
npm run build
node scripts/serve-terminal.mjs
```

```sh
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cargo clippy --locked --target wasm32-unknown-unknown -- -D warnings
cargo test --workspace --locked
node --experimental-strip-types --test scripts/core-wasm.test.mjs
node --test scripts/serve-terminal.test.mjs
npx --no-install playwright install chromium
npm test
cargo fetch --locked --manifest-path apps/desktop/Cargo.toml
python -B scripts/test_supply_chain.py
python -B scripts/supply_chain.py --check
python -B scripts/check_readmes.py
npm audit --audit-level=high
python -B scripts/advisories.py
python -B scripts/package_browser.py
```

[verify.yml](../../.github/workflows/verify.yml) · [docs/native-advisories.md](../../docs/native-advisories.md)

<!-- section:10 -->
## Menelusuri dan mereproduksi masalah

Jika port sibuk gunakan --port 4174 dan pindahkan data dengan ekspor dan pemulihan. Saat mode luring gagal, buka versi produksi secara daring dan tunggu Offline ready. Jika file ditolak, periksa baris yang disebut, waktu mulai, serta kalender pasar dan tanggal.

Simpan CSV, kalender, interval, revisi Git, versi peramban, dan waktu peristiwa. Laporkan contoh sintetis dan langkah pertama yang gagal. Catatan verifikasi memuat bukti per platform dan peta jalan menyebut target berikutnya.

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## Repositori, kontribusi, dan lisensi

Mesin dan fixture di crates/core, terminal dan uji di apps/terminal, host di apps/desktop, SDK di packages/trading-bot, dan alat di scripts. Buat perubahan kecil dan teruji. Hormati hak serta pemberitahuan, perbarui inventaris saat dependensi berubah, dan laporkan kerentanan secara pribadi.

Kode asli memakai 0BSD dan dependensi memakai lisensinya sendiri. Edisi lengkap mengikuti jumlah penutur bahasa pertama dan kedua Ethnologue 2026, termasuk dua bahasa yang seri di peringkat 20 setelah pembulatan. Antarmuka dan panduan tertaut mungkin berbahasa Inggris.

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
