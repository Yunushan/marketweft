<!-- MarketWeft README · locale=vi -->

# MarketWeft

**0.157.0 · 0BSD**

**Ngôn ngữ tài liệu**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · **Tiếng Việt** · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## MarketWeft làm gì

MarketWeft là terminal nghiên cứu ưu tiên chạy cục bộ cho nhà phân tích, lập trình viên và người vận hành. Terminal mở OHLCV được cấp quyền, vẽ nến và khối lượng, tính SMA và EMA bằng số dấu phẩy cố định, lưu danh sách theo dõi, tài sản và chỉ báo vào IndexedDB. Sau khi lưu tài nguyên vào bộ đệm, ứng dụng chạy ngoại tuyến. Giá và khối lượng đi kèm là dữ liệu tổng hợp và không cần tài khoản.

MarketWeft 0.157.0 bổ sung phần mở rộng giá Fibonacci với ba điểm neo có thể chỉnh sửa trên biểu đồ. MarketWeft 0.7.0 bổ sung sàng lọc tập mã theo tỷ suất thay đổi giá dựa trên dữ liệu đã biết tại thời điểm truy vấn. Phát lại theo phiên bao gồm chia tách cổ phiếu, cổ tức tiền mặt, thay đổi thành viên và hủy niêm yết. Kho mã còn có trình quan sát TypeScript chỉ đọc cho dịch vụ trading-bot riêng biệt và lớp bọc Tauri thử nghiệm. Luồng dữ liệu từ nhà cung cấp, đặt lệnh, trình cài đặt có chữ ký và lưu trữ đa người dùng vẫn nằm trong lộ trình.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## Khởi động terminal di động

Tải browser-terminal-attempt-N từ lần kiểm chứng GitHub thành công. Giải nén MarketWeft-browser-0.157.0.zip, giữ dist/ cùng thư mục với serve-terminal.mjs và chạy lệnh tại đó. Mở http://127.0.0.1:4173/ trên trình duyệt hỗ trợ WebAssembly, Canvas, BigInt và IndexedDB. Dùng Node.js 22.12 trở lên. Không phải cài npm. Chờ Offline ready trước khi ngắt mạng.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## Phát lại ví dụ NYSE

Trong Historical replay chọn Start demo. Next event tiến, Previous event lùi, Play và Pause điều khiển phát, Reset xóa lịch sử đang hiển thị. Biểu đồ ban đầu trống. Nến xuất hiện khi khoảng thời gian kết thúc. Event time chỉ đầu khoảng hoặc ranh giới phiên. Observed at cho biết lúc dữ liệu có hiệu lực. Tốc độ chỉ đổi nhịp hiển thị.

Ngày 31/10/2025 mở cửa 13:30 UTC (UTC−04:00), ngày 3/11 là 14:30 UTC (UTC−05:00). Khoảng thiếu lúc 15:00 ngày 3/11 chỉ được báo lúc 15:30. Lễ Tạ ơn không có khoảng giao dịch. Ngày 28/11 đóng sớm lúc 18:00 UTC sau bảy nến 30 phút. Ví dụ có 20 phiên, 253 nến, 294 sự kiện, giá tổng hợp và lịch công bố của NYSE.

Mở Historical replay → Start split demo và đổi Price basis giữa Raw và Split-adjusted ở cùng sự kiện. Tách 2 đổi 1 được công bố và quan sát trước khi có hiệu lực. Hai chế độ giống nhau cho đến lúc đó. Khi có hiệu lực, giá đóng cuối trước khi tách chuyển từ 106.50 gốc sang 53.25 đã chỉnh, khối lượng tăng gấp đôi. Nến đầu sau tách vẫn 53.00. Với dữ liệu của bạn, tải Corporate actions CSV cho mã đã chọn, xác nhận OHLCV thô và cung cấp lịch phiên. Tỷ lệ quan sát mới nhất áp dụng khi có hiệu lực. Tin tới muộn và đính chính chỉ đổi cách hiển thị từ lúc quan sát. Lịch sử nguồn được giữ nguyên.

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

Mở Historical replay → Start dividend demo để theo dõi 100 cổ phiếu đủ quyền mỗi lần chia. Ngày giao dịch không hưởng quyền tạo khoản phải thu USD 25.00. Điều chỉnh nâng lên USD 30.00 và ngày thanh toán mới lùi khoản ghi có. Báo cáo muộn ghi có EUR 10.00 ngay khi quan sát. Sửa sau thanh toán còn USD 28.00. Lùi lại để xem số dư trước. Với dữ liệu riêng, tải Cash dividends CSV và điền Entitled shares per distribution. Giữ nguyên ID phân phối giữa các lần sửa. Sổ tách theo tiền tệ và giữ bút toán cũ cùng giá gốc.

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

Mở Historical replay → Open universe replay → Start universe demo. Lúc 14:05 UTC chỉ ALFA thuộc tập, BETA vào lúc 14:10. Việc loại ALFA có hiệu lực 14:20 và được biết lúc 14:25. BETA bị hủy niêm yết lúc 14:30 và được biết lúc 14:35. Lùi lại hoặc truy vấn Effective time và Known time độc lập. Tải Universe membership CSV cho dữ liệu riêng. Giữ ID thay đổi khi sửa và dùng ID niêm yết khác khi tái sử dụng mã.

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

Trong Universe screen, chọn Load demo prices và giữ mốc gốc 14:00 UTC. Lúc 14:05, ALFA dẫn đầu với 1%. BETA gia nhập lúc 14:10 và chưa được xếp hạng cho đến khi giá đóng cửa được ghi nhận lúc 14:12. Giữ thời điểm hiệu lực 14:10, lần lượt truy vấn theo thời điểm biết 14:12 và 14:16 để so sánh mức 12% của BETA với mức 1% sau điều chỉnh. Tại mốc hiệu lực 14:20, ALFA rời bảng khi việc loại bỏ được ghi nhận lúc 14:25. Tải Universe prices CSV theo mã niêm yết và thời điểm đóng cửa chính xác. Thiếu giá gốc hoặc giá đích thì thành viên không có hạng.

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

Sau khi nạp giá mẫu, chọn Load demo sectors trong Sector heatmap. Lúc 14:10 UTC, bản đồ bao phủ 60% trọng số đã biết. Khi biết giá BETA lúc 14:12, độ phủ tăng lên 100% và đóng góp quan sát được tăng từ 1,2% lên 6%. Bản sửa lúc 14:16 chuyển BETA từ Financials sang Technology. Mở một ô để xem hạng, đóng góp và thời điểm phân ngành. Với dữ liệu riêng, hãy tải Sector and weight CSV.

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

Mở Historical replay → Open financial statements → Start financial demo. Original filing cho P/E 10×. Với cùng thời điểm định giá, Restatement observed tăng P/E lên 15× và báo thiếu vốn cổ phần phổ thông. Revised capitalization tăng P/E lên 20×. Tải Annual filings CSV và Capitalization CSV tùy chọn để truy vấn tổ chức phát hành và thời điểm dữ liệu được biết.

```csv
issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow
DEMO-ALFA,ALFA-FY24-A1,2024-01-01,2024-12-31,2025-04-03T14:15:00Z,2025-04-03T14:20:00Z,USD,8000000000,800000000,,-250000000
```

```csv
issuer_id,source_id,valuation_at,observed_at,currency,market_cap
DEMO-ALFA,ALFA-CAP,2025-04-03T14:00:00Z,2025-04-03T14:01:00Z,USD,12000000000
```

Mở Historical replay → Open economic calendar → Start calendar demo. Trước khi công bố, dự báo là 2,5% và chưa có số thực tế. Actual observed hiển thị 2,7% lúc 14:32 UTC. Revised actual hiển thị 2,8%, và Release evidence lưu cả hai lần sửa đổi. Tải Macro calendar CSV để dùng các kỳ công bố của bạn.

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

Mở Historical replay → Open option chain → Start option demo. Cặp tháng Tư ở giá thực hiện 100 bắt đầu với IV khoảng 20%. Late option quote hiển thị quyền mua ở giá 90 với IV 25%. Corrected spread khôi phục định giá một quyền bán. Mở Implied volatility surface để so sánh kỳ hạn. Dùng Underlying CSV và Option quotes CSV để nạp báo giá của bạn.

```csv
underlying,currency,quote_at,observed_at,spot,rate,dividend_yield
DEMO:OPT,USD,2025-04-03T13:59:00Z,2025-04-03T13:59:00Z,100,0.03,0.01
```

```csv
contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask
APR-C100,DEMO:OPT,USD,call,2026-04-03T14:00:00Z,100,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,8.807321,8.847321
```

Mở Historical replay → Open replay alerts → Start alert demo. First crossing hiển thị một cảnh báo ngưỡng. Correction observed cho thấy mẫu đã sửa và giao cắt trung bình động. Full alert replay hiển thị tám cảnh báo. Nhấn Save to alert inbox hai lần để lưu tám bản ghi lần đầu và không có bản ghi mới lần hai. Dùng Alert rules CSV và Alert observations CSV cho dữ liệu của bạn.

```csv
rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand
LEVEL,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5
```

```csv
observation_id,series_id,measured_at,observed_at,value
O2,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:02:00Z,6
```

Mở Historical replay → Open paper ledger → Start paper demo. Bước từ số tiền giữ trước 503 tới khớp lệnh một phần duy nhất còn 801,6 tiền mặt. Sau khi dừng, Final account hiển thị 663,7 tiền mặt và 13 lợi nhuận đã thực hiện. Dùng Paper events CSV để phát lại dữ liệu mô phỏng của bạn.

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

Mở Historical replay → Open bar backtest → Start backtest demo. Tín hiệu lúc 14:05 UTC đặt lệnh mua. Khoảng 14:06 bị thiếu nên lệnh chưa khớp. Giá đóng cửa 14:07 cho phép khớp hai cổ phiếu. Final backtest hiển thị vốn 957,8. Dùng CSV phiên và nến cho lịch sử cục bộ.

Trong bản minh họa kiểm thử quá khứ, chạy Walk-forward validation với sáu nến huấn luyện và hai nến kiểm định. Cửa sổ hoàn chỉnh đầu tiên xuất hiện lúc 14:09 UTC. Cặp 1:2 thắng trên tập huấn luyện và được giữ cố định trong hai nến kiểm định, bắt đầu từ tài khoản mới.

Trong bản minh họa kiểm thử quá khứ, chạy Seeded scenarios với hạt giống 20250403, 256 đường mô phỏng và tám biến động mỗi đường. Vốn cuối kỳ đối chứng là 957,8 và trung vị các kịch bản là 997,6. Cùng thời điểm cắt, dữ liệu và hạt giống sẽ tái lập bảng rủi ro.

Trong bản thử tập mã, nạp Delisting proceeds cho BETA-001 và đặt cả hai mốc cắt ở 14:35 UTC để thấy khoản thu chưa có. Lúc 14:37, mười cổ phiếu có khoản phải thu 70 USD và tiền được ghi sổ lúc 14:50. Điều chỉnh về sau giữ nguyên các mốc cũ và tách riêng BETA-002.

Mở Start split revisions demo và chọn Split-adjusted. Ngày 3 tháng 6 lúc 14:10 UTC, sửa thời điểm hiệu lực làm rút điều chỉnh cũ. Lúc 14:20 hai hệ số được nhân với nhau. Hủy SPLIT-A lúc 14:30 vẫn giữ SPLIT-B và các nến gốc.

Mở Start dividend entitlement demo. ALPHA có 100 cổ phiếu đủ điều kiện lúc đầu và tăng lên 120 khi báo cáo đến muộn. BETA dùng 40 cổ phiếu. Sau khi thanh toán, điều chỉnh ALPHA xuống 110 cổ phiếu hoàn lại 3 USD. Tua lại để xem số dư trước đó.

Trong bản thử tập mã, nạp Portfolio replay. Giá đóng cửa BETA-001 lúc 14:10 UTC chỉ hiện khi được biết lúc 14:12. Lúc 14:45, 70 USD phải thu tách riêng khỏi 225 EUR giá trị cổ phiếu BETA-002. Lúc 14:50, giá trị cổ phiếu và tiền thu khi hủy niêm yết là 284 USD.

Chọn Compare charts rồi chọn mã để so sánh. Link by UTC đánh dấu cùng thời điểm đang hiển thị trên cả hai khung. Thu phóng từng khung độc lập. Bản sao lưu lưu mã, chỉ báo phủ và thiết lập liên kết.

Chọn Draw measurement rồi chọn thanh UTC hiện có và giá cho từng đầu mút. Khi thu phóng hay dịch biểu đồ, đường đo được vẽ lại từ tọa độ đã lưu. Bản sao lưu giữ các tọa độ này. Ứng dụng hiển thị số giây và mức thay đổi giá tuyệt đối lẫn phần trăm.

Mở Indicators và đặt chu kỳ SMA và EMA theo số thanh cho mỗi khung. Khi có đủ giá đóng cửa, biểu đồ hiển thị giá trị tại thanh UTC đã chọn. Chu kỳ được giữ khi đổi mã, tải lại hoặc khôi phục bản sao lưu.

Mở Export CSV bên dưới biểu đồ. Tải các thanh OHLCV để nhập lại hoặc thêm nguồn gốc và đường trung bình động đang bật để phân tích. Ô trung bình để trống khi chưa đủ giá đóng cửa.

Chọn Close line trong bộ chọn loại của một khung. Đường dùng các giá đóng cửa quan sát được và vẫn hiển thị khối lượng cùng chỉ báo đã bật. Thanh UTC bị thiếu không có con trỏ chéo liên kết. Bản sao lưu giữ loại biểu đồ đã chọn.

Chọn OHLC bars. Đường dọc cho biết giá cao và thấp, vạch trái là giá mở cửa và vạch phải là giá đóng cửa. Mỗi khung giữ loại biểu đồ riêng và con trỏ liên kết khớp đúng thanh UTC.

Mở Timeframe trong một khung và nhập khoảng nguồn, khoảng đích theo giây. Biểu đồ và CSV nghiên cứu hiển thị số thanh nguồn quan sát được. Bản sao lưu giữ chuỗi gốc.

Thêm CSV lịch phiên trong Timeframe. Các khoảng bắt đầu từ giờ mở phiên và khoảng cuối kết thúc vào giờ đóng cửa đã ghi. CSV nghiên cứu lưu tên lịch và mức độ bao phủ dữ liệu nguồn.

Mở Recorded tick bars rồi chọn số giao dịch và thời điểm chốt quan sát. Biểu đồ giữ thứ tự ghi nhận khi thời điểm trùng nhau, đánh dấu thanh chưa đủ và xuất ranh giới số thứ tự chính xác.

Trong Portfolio replay, tải bản mẫu cổ tức hoặc thêm CSV. Truy vấn dùng vị thế trước ngày giao dịch không hưởng quyền, ghi tiền vào ngày trả và áp dụng các sửa đổi tại thời điểm quan sát.

Sau khi nạp giá, mở Relative returns trong Universe screen. Chọn hai mã định danh niêm yết và thời điểm gốc UTC chính xác. Đổi các mốc truy vấn để xem giá đóng cửa bị thiếu và các lần chỉnh sửa, rồi tải toàn bộ kết quả so sánh dưới dạng CSV.

Mở Recorded market depth và nạp CSV độ sâu cho mã đã chọn. Chuyển qua các mốc quan sát để xem các mức giá mua bán, chỗ đứt chuỗi và quá trình khôi phục ở ảnh chụp kế tiếp. Tải mọi mức dưới dạng CSV.

Mở Recorded footprint và nạp giao dịch của mã đã chọn. Đặt khoảng thời gian khớp lệnh và mốc quan sát để xem khối lượng mua, bán và chưa rõ theo từng vùng giá. Tải footprint đầy đủ và delta tích lũy dưới dạng CSV.

Sau khi chạy truy vấn trong Recorded footprint, mở Price profiles. So sánh khối lượng theo giá với số khoảng thời gian có giao dịch ở mỗi vùng giá. Đặt mục tiêu vùng giá trị và tải toàn bộ hồ sơ dưới dạng CSV.

Mở Rolling risk bên dưới Relative returns. Đặt khoảng UTC, độ dài cửa sổ và hệ số biến động để xem lợi suất sẵn có cho từng niêm yết và số mẫu ghép cặp. Tải toàn bộ nghiên cứu dưới dạng CSV.

Sau khi nạp giá trong Universe screen, mở Correlated portfolio scenarios. Đặt tỷ trọng, hạt giống và phí cân bằng lại. Xem độ phủ lợi suất đầy đủ và các phân vị, rồi tải mọi đường mô phỏng dưới dạng CSV.

Trong Universe screen, mở Cross-sectional paper replay và nạp báo cáo thanh khoản. Đặt thời điểm quyết định đầu tiên và tiêu chí xếp hạng. Xem các mã được chọn, lệnh, tiền mặt và giá trị giao dịch hoặc tải toàn bộ bản phát lại dưới dạng CSV.

Trong Cross-sectional paper replay, mở Corporate cash reports và nạp các tệp CSV phù hợp. Chạy phát lại để xem quyền nhận tiền, điều chỉnh thanh toán, vị thế được khôi phục và biên nhận. Tải sổ tiền mặt dưới dạng CSV.

Trong Bar backtest, mở Recorded trade execution và nạp CSV giao dịch. Đặt hai mốc thời gian để xem khớp một phần đến muộn, mã thứ tự chính xác, tiền mặt và giá trị tài khoản. Tải toàn bộ lịch sử dưới dạng CSV.

Sau khi phát lại xếp hạng, mở Cross-sectional walk-forward. So sánh thời gian nhìn lại và số mã, xem các kiểm thử riêng biệt và định giá còn thiếu, rồi xuất điểm số và nguồn dữ liệu dưới dạng CSV.

Chọn biểu đồ và mở Time-series formulas. Nhập biểu thức OHLCV và mốc quan sát, xem giá trị chính xác và hàng thiếu, rồi xuất công thức, nguồn, phiên bản ngôn ngữ và kết quả dưới dạng CSV.

Nạp lịch sử nến và mở Formula paper backtest. Đặt công thức vào, thoát và hai mốc thời gian. So sánh khớp theo khối lượng nến và giao dịch đã ghi, rồi xuất toàn bộ biên nhận dưới dạng CSV.

Tải gói từ một kiểm thử công thức đã chạy thành công. Nạp vào không gian làm việc khác để khôi phục hai công thức, chế độ khớp và cấu hình tài khoản chính xác. Dùng cùng dữ liệu và các mốc thời gian để tái tạo kết quả.

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [Rank comparison](../../docs/universe-screen.md#compare-ranks-at-two-cutoffs) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [Sector heatmap comparison](../../docs/sector-heatmap.md#compare-heatmaps-at-two-cutoffs) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md) · [split-revisions.csv](../../crates/core/tests/fixtures/synthetic-split-revisions.csv) · [dividend-positions.csv](../../crates/core/tests/fixtures/synthetic-dividend-positions.csv) · [portfolio-replay.md](../../docs/portfolio-replay.md) · [portfolio-holdings.csv](../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [chart-workspace.md](../../docs/chart-workspace.md) · [relative-returns.md](../../docs/relative-returns.md) · [recorded-depth.md](../../docs/recorded-depth.md) · [recorded-footprint.md](../../docs/recorded-footprint.md) · [price-profiles.md](../../docs/price-profiles.md) · [listing-risk.md](../../docs/listing-risk.md) · [portfolio-scenarios.md](../../docs/portfolio-scenarios.md) · [cross-sectional-paper.md](../../docs/cross-sectional-paper.md) · [paper-corporate-cash.md](../../docs/paper-corporate-cash.md) · [recorded-trade-execution.md](../../docs/recorded-trade-execution.md) · [cross-sectional-walk-forward.md](../../docs/cross-sectional-walk-forward.md) · [time-series-language.md](../../docs/time-series-language.md) · [formula-paper-backtest.md](../../docs/formula-paper-backtest.md) · [formula-strategy-packages.md](../../docs/formula-strategy-packages.md) · [formula-walk-forward.md](../../docs/formula-walk-forward.md) · [formula-functions.md](../../docs/formula-functions.md) · [TypeScript SDK](../../packages/research/README.md) · [Python SDK](../../packages/python-research/README.md) · [MCP](../local-mcp-research.md) · [Research screen](../research-universe-screen.md) · [Rank comparison APIs](../research-universe-screen.md#compare-rank-snapshots) · [Local REST](../local-rest-research.md) · [REST rank comparison](../local-rest-research.md#compare-universe-ranks) · [Rank comparison stream](../local-rest-research.md#stream-rank-comparisons) · [gRPC rank comparison](../local-rest-research.md#rank-comparisons-over-grpc) · [WebSocket](../local-rest-research.md#websocket-streaming) · [gRPC](../local-rest-research.md#grpc-research) · [SQLite audit](../local-rest-research.md#sqlite-audit-receipts) · [Audit recovery](../local-rest-research.md#audit-backup-and-recovery) · [Concurrency](../local-rest-research.md#concurrency-and-retries) · [Managed credentials](../local-rest-research.md#managed-research-credentials) · [Localhost TLS](../local-rest-research.md#localhost-tls) · [Private research](../local-rest-research.md#private-interface-research) · [Research OCI image](../local-rest-research.md#research-oci-image) · [Docker Compose](../local-rest-research.md#private-docker-compose-deployment) · [Kubernetes](../local-rest-research.md#private-kubernetes-deployment) · [Health and metrics](../local-rest-research.md#loopback-health-and-metrics) · [Controlled shutdown](../local-rest-research.md#controlled-shutdown) · [Fresh-volume recovery](../local-rest-research.md#recover-audit-in-a-separate-compose-project) · [Audit snapshot verification](../local-rest-research.md#verify-a-portable-audit-snapshot) · [Restore with a SHA-256 digest](../local-rest-research.md#restore-with-a-trusted-sha-256-digest) · [Research readiness](../local-rest-research.md#research-readiness) · [Source permissions](../source-permissions.md) · [Chart export permission](../source-permissions.md#chart-csv-export) · [Formula use permission](../source-permissions.md#time-series-formulas) · [Formula export permission](../source-permissions.md#formula-csv-export) · [Provider history fixture](../provider-history-fixture.md) · [Provider CSV verification](../provider-history-fixture.md#verify-the-embedded-csv) · [Provider signature verification](../provider-history-fixture.md#verify-a-signed-provider-fixture) · [Provider verification records](../provider-history-fixture.md#provider-verification-records) · [Provider key registry](../provider-history-fixture.md#provider-key-registry) · [Provider key validity windows](../provider-history-fixture.md#provider-key-validity-windows) · [Provider revision replay](../provider-revisions.md) · [Provider bar withdrawals](../provider-revisions.md#withdraw-and-replace-a-bar) · [Provider replay chart](../provider-revisions.md#provider-replay-chart) · [Signed provider revisions](../provider-revisions.md#load-a-signed-provider-revision-fixture) · [Provider replay CSV](../provider-revisions.md#verify-the-source-and-download-the-replay) · [Quarterly financial filings](../financial-statements.md#quarterly-filings-and-trailing-twelve-months) · [Trailing valuation multiples](../financial-statements.md#choose-a-valuation-basis) · [Native financial snapshots](../../packages/python-research/README.md#financial-snapshots) · [MCP financial snapshots](../local-mcp-research.md#financial-snapshots) · [American exercise pricing](../option-chain.md#american-exercise-pricing) · [American implied volatility](../option-chain.md#american-implied-volatility) · [Discrete cash dividends](../option-chain.md#discrete-cash-dividends) · [Cash-dividend implied volatility](../option-chain.md#cash-dividend-implied-volatility) · [Native option snapshots](../../packages/python-research/README.md#option-chain-snapshots) · [Native American option valuations](../../packages/python-research/README.md#american-option-valuations) · [TypeScript option research](../../packages/research/README.md#option-snapshots-and-american-valuations) · [MCP option snapshots](../local-mcp-research.md#option-chain-snapshots) · [MCP American option valuations](../local-mcp-research.md#american-option-valuations) · [REST option snapshots](../local-rest-research.md#option-chain-snapshots) · [REST American option valuations](../local-rest-research.md#american-option-valuations) · [Option snapshots over WebSocket](../local-rest-research.md#option-snapshots-over-websocket) · [Option snapshots over gRPC](../local-rest-research.md#option-snapshots-over-grpc) · [American valuations over gRPC](../local-rest-research.md#american-valuations-over-grpc) · [Heikin-Ashi charts](../chart-workspace.md#heikin-ashi) · [Renko charts](../chart-workspace.md#renko) · [Three Line Break](../chart-workspace.md#three-line-break) · [Kagi charts](../chart-workspace.md#kagi) · [Point and Figure](../chart-workspace.md#point-and-figure) · [Recorded range bars](../chart-workspace.md#recorded-range-bars) · [Recorded volume bars](../chart-workspace.md#recorded-volume-bars) · [Wilder RSI](../chart-workspace.md#wilder-relative-strength-index) · [Wilder ATR](../chart-workspace.md#wilder-average-true-range) · [Bollinger Bands](../chart-workspace.md#bollinger-bands) · [Bollinger %B and BandWidth](../chart-workspace.md#bollinger-b-and-bandwidth) · [Donchian Channels](../chart-workspace.md#donchian-channels) · [Keltner Channels](../chart-workspace.md#keltner-channels) · [Stochastic Oscillator](../chart-workspace.md#stochastic-oscillator) · [Williams %R](../chart-workspace.md#williams-r) · [MACD](../chart-workspace.md#macd) · [On-Balance Volume and Accumulation/Distribution](../chart-workspace.md#cumulative-volume-studies) · [Chaikin studies](../chart-workspace.md#chaikin-studies) · [MFI and VWMA](../chart-workspace.md#money-flow-index-and-volume-weighted-moving-average) · [Directional Movement System](../chart-workspace.md#directional-movement-system) · [CCI and ROC](../chart-workspace.md#commodity-channel-index-and-rate-of-change) · [Aroon](../chart-workspace.md#aroon-and-aroon-oscillator) · [Price lines and UTC markers](../chart-workspace.md#horizontal-price-lines-and-utc-time-markers) · [Horizontal rays and trend lines](../chart-workspace.md#horizontal-rays-and-trend-lines) · [Rectangles and parallel channels](../chart-workspace.md#rectangles-and-parallel-channels) · [Polylines and Fibonacci retracements](../chart-workspace.md#polylines-and-fibonacci-retracements) · [Fibonacci price extensions](../chart-workspace.md#fibonacci-price-extensions) · [Ellipses and triangles](../chart-workspace.md#ellipses-and-triangles) · [Chart notes and directional arrows](../chart-workspace.md#chart-notes-and-directional-arrows) · [Price and time ranges](../chart-workspace.md#price-and-time-range-highlights) · [Candlestick pattern replay](../candlestick-patterns.md) · [Candlestick pattern alerts](../replay-alerts.md#candlestick-pattern-alerts) · [Signed webhook delivery](../local-webhook-delivery.md) · [Webhook event export](../replay-alerts.md#export-a-webhook-event) · [Resume delivery](../local-webhook-delivery.md#resume-a-pending-delivery) · [Close area and step line](../chart-workspace.md#close-area-and-step-line) · [Baseline chart](../chart-workspace.md#baseline-chart) · [Close-change histogram](../chart-workspace.md#close-change-histogram) · [Volume-weighted candles](../chart-workspace.md#volume-weighted-candles) · [High-low band](../chart-workspace.md#high-low-band) · [Rebased percent change](../chart-workspace.md#rebased-percent-change) · [Peak-to-trough drawdown](../chart-workspace.md#peak-to-trough-drawdown) · [Confirmed close swings](../chart-workspace.md#confirmed-close-swings) · [Anchored VWAP](../chart-workspace.md#anchored-vwap) · [Pitchfork](../chart-workspace.md#pitchfork) · [Risk/reward drawing](../chart-workspace.md#riskreward-drawing) · [Regression channel](../chart-workspace.md#regression-channel)

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
