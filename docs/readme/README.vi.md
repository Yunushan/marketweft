<!-- MarketWeft README · locale=vi -->

# MarketWeft

**0.3.0 · 0BSD**

**Ngôn ngữ tài liệu**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · **Tiếng Việt** · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## MarketWeft làm gì

MarketWeft là terminal nghiên cứu ưu tiên chạy cục bộ cho nhà phân tích, lập trình viên và người vận hành. Terminal mở OHLCV được cấp quyền, vẽ nến và khối lượng, tính SMA và EMA bằng số dấu phẩy cố định, lưu danh sách theo dõi, tài sản và chỉ báo vào IndexedDB. Sau khi lưu tài nguyên vào bộ đệm, ứng dụng chạy ngoại tuyến. Giá và khối lượng đi kèm là dữ liệu tổng hợp và không cần tài khoản.

Bản 0.3.0 phát lại một chuỗi lịch sử bất biến theo phiên. Kho mã còn có SDK TypeScript chỉ đọc cho trading-bot độc lập và khung Tauri thử nghiệm. Sự kiện doanh nghiệp, nguồn cấp, lệnh, máy chủ nhiều người dùng và trình cài đặt có chữ ký nằm trong lộ trình.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## Khởi động terminal di động

Tải browser-terminal-attempt-N từ lần kiểm chứng GitHub thành công. Giải nén MarketWeft-browser-0.3.0.zip, giữ dist/ cùng thư mục với serve-terminal.mjs và chạy lệnh tại đó. Mở http://127.0.0.1:4173/ trên trình duyệt hỗ trợ WebAssembly, Canvas, BigInt và IndexedDB. Dùng Node.js 22.12 trở lên. Không phải cài npm. Chờ Offline ready trước khi ngắt mạng.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## Phát lại ví dụ NYSE

Trong Historical replay chọn Start demo. Next event tiến, Previous event lùi, Play và Pause điều khiển phát, Reset xóa lịch sử đang hiển thị. Biểu đồ ban đầu trống. Nến xuất hiện khi khoảng thời gian kết thúc. Event time chỉ đầu khoảng hoặc ranh giới phiên. Observed at cho biết lúc dữ liệu có hiệu lực. Tốc độ chỉ đổi nhịp hiển thị.

Ngày 31/10/2025 mở cửa 13:30 UTC (UTC−04:00), ngày 3/11 là 14:30 UTC (UTC−05:00). Khoảng thiếu lúc 15:00 ngày 3/11 chỉ được báo lúc 15:30. Lễ Tạ ơn không có khoảng giao dịch. Ngày 28/11 đóng sớm lúc 18:00 UTC sau bảy nến 30 phút. Ví dụ có 20 phiên, 253 nến, 294 sự kiện, giá tổng hợp và lịch công bố của NYSE.

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv)

<!-- section:04 -->
## Nhập và phát dữ liệu của bạn

Chọn Import CSV, nhập thị trường và mã, rồi chọn OHLCV UTF-8 được cấp quyền lưu. Giây Unix, ngày UTC hoặc thời điểm UTC kết thúc bằng Z phải tăng nghiêm ngặt. Tối đa sáu chữ số thập phân, khối lượng không âm và giá cao/thấp bao cả giá mở và đóng. Một dòng sai hủy cả lần nhập. Điền chu kỳ, nguồn, quyền và chính sách điều chỉnh trong Series details.

Đóng dấu nến theo đầu khoảng. Trong Historical replay chọn tài sản, lịch CSV và số giây nguyên (1–86.400). Mỗi dòng ghi đúng biên UTC, độ lệch phút lúc mở và regular hoặc early. Lưới bắt đầu từ giờ mở, đoạn cuối có thể ngắn hơn. Từ chối nến ngoài phiên hoặc lệch lưới. Khoảng thiếu làm đồng hồ tiến và giữ giá đã thấy.

Mặc định 1.500.000 byte và 100.000 nến mỗi tệp. Cấu hình build có thể đến 8 MiB và 100.000 dòng. Lịch nhận 1 MiB, 10.000 đoạn không chồng và 200.000 sự kiện. Hạn ngạch trình duyệt áp dụng riêng.

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
## Sao lưu, di chuyển và khôi phục

Workspace backup → Export workspace lưu JSON có phiên bản, gồm CSV gốc, nguồn, lịch sử ẩn và hiện, thứ tự danh sách, lựa chọn và chỉ báo. Tại hồ sơ đích chọn Backup file, kiểm tra số lượng và bấm Restore workspace. Một giao dịch thay thế danh mục đích. Xuất bản sao từ đích trước nếu cần giữ.

Khi nâng cấp, giữ cùng giao thức, máy chủ, cổng và hồ sơ. Không gian 0.1.0 chuyển vào IndexedDB, được đọc lại để kiểm và giữ giá trị cũ. Đóng tab bản cũ. Bản sao là văn bản thuần. SHA-256 kiểm tính toàn vẹn. Quản lý lưu trữ, truy cập và thời hạn theo quyền dữ liệu.

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## Kiến trúc và quy tắc số học

Rust kiểm tra mã, UTC và OHLCV, tính bằng số nguyên phần triệu và lập kế hoạch sự kiện. React dùng cùng máy Wasm, Canvas, giao dịch IndexedDB và service worker lưu tài nguyên. Mã sửa đổi phát hiện ghi đồng thời. Trạng thái gắn với hồ sơ và nguồn trình duyệt.

SMA dùng tổng trượt chính xác. EMA bắt đầu từ cửa sổ đủ đầu tiên và làm tròn phần triệu từng bước, trường hợp hòa thì xa số không. Phát lại chỉ dùng giá đóng đã hiện. Cuối khoảng là thời điểm khả dụng theo mô hình. Thời gian đến thực, sửa đổi và thời gian trong nến cần đầu vào riêng. Các dòng gốc được giữ.

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## Triển khai và phạm vi vận hành

Phục vụ dist/ qua HTTPS hoặc chạy trình khởi động loopback. Dùng cùng nguồn để giữ không gian làm việc. Cổng, hồ sơ hoặc cửa sổ riêng khác có kho khác. Để thử Tauri, build web và cài điều kiện hệ thống. CI build Windows Server 2022, macOS 15 và Ubuntu 24.04, đồng thời mở thử cửa sổ Linux. Ma trận nêu tình trạng di động, ARM và BSD. Dùng Chromium máy tính để test.

Hiện mỗi hồ sơ dành cho một người dùng cục bộ. Lưu dữ liệu và bản sao trên thiết bị được duyệt. Xác thực, tách người dùng, giám sát, lưu giữ và mục tiêu phục hồi cần thiết kế triển khai đã kiểm chứng. ZIP có thông báo giấy phép và SBOM CycloneDX. Quy trình tag phiên bản có chứng thực.

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## Quan sát dịch vụ ngoài

TradingBotObserverV1 đọc runtime, status, account và portfolio từ trading-bot cấu hình riêng. Dùng nguồn tin cậy, HTTPS ngoài loopback và token hợp lệ qua cấu hình tiến trình. Đọc dấu thời gian của từng ảnh chụp. Trạng thái khỏe hoặc ảnh trống không cho thêm số dư và vị thế. Thông tin xác thực, lệnh và thực thi thuộc dịch vụ ngoài.

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
## Build và kiểm chứng mã nguồn

Dùng Node.js 22.12 trở lên với npm, Rustup theo rust-toolchain.toml và Python 3.11 trở lên. Chạy ở gốc kho. Vite in URL phát triển, thường là 5173. Bản sản xuất dùng 4173. Cài đúng Chromium được khóa trước khi chạy test.

Kiểm chứng bao gồm Rust, Wasm, trình duyệt, SDK, máy chủ, giấy phép, SBOM và cảnh báo. Sau mỗi sự kiện, cả hai đường trung bình trùng với đoạn đầu tương ứng của kết quả theo lô, kể cả đổi giờ, thiếu dữ liệu và đóng sớm. CI chờ ID của ZIP rồi so từng byte tải về. Tag đúng phiên bản kích hoạt chứng thực.

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
## Chẩn đoán và tái hiện lỗi

Nếu cổng bận, dùng --port 4174 và chuyển dữ liệu bằng xuất và phục hồi. Khi lỗi ngoại tuyến, mở bản sản xuất có mạng và chờ Offline ready. Nếu tệp bị từ chối, kiểm tra dòng báo lỗi, đầu khoảng và lịch đúng thị trường cùng ngày.

Giữ CSV, lịch, khoảng, phiên bản Git, trình duyệt và thời điểm sự kiện. Báo trường hợp tổng hợp và bước đầu tiên bị lỗi. Hồ sơ kiểm chứng cung cấp bằng chứng nền tảng, lộ trình cho biết mục tiêu tiếp theo.

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## Kho mã, đóng góp và giấy phép

Máy tính và mẫu ở crates/core, web và test ở apps/terminal, host ở apps/desktop, SDK ở packages/trading-bot và công cụ ở scripts. Thay đổi nhỏ và có kiểm thử. Giữ quyền dữ liệu và thông báo, cập nhật kiểm kê khi đổi phụ thuộc, báo lỗ hổng riêng tư.

Mã gốc dùng 0BSD. Phụ thuộc có giấy phép riêng. Các bản đầy đủ theo tổng người nói ngôn ngữ thứ nhất và thứ hai của Ethnologue 2026, gồm hai ngôn ngữ đồng hạng 20 sau khi làm tròn. Giao diện và tài liệu liên kết có thể dùng tiếng Anh.

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
