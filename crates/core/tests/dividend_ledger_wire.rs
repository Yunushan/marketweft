use marketweft_core::research::{dividend_ledger_request, MAX_DIVIDEND_LEDGER_REQUEST_BYTES};
use std::io::Write;
use std::process::{Command, Stdio};

const REPORTS: &str = include_str!("fixtures/synthetic-dividend-withholding.csv");
const POSITIONS: &str = "instrument,effective_at,observed_at,shares\n\
    DEMO:DIVIDEND,2025-06-03T13:50:00Z,2025-06-03T13:55:00Z,100\n\
    DEMO:DIVIDEND,2025-06-03T13:50:00Z,2025-06-04T14:30:00Z,120\n";

fn request(mode: &str, known: &str, shares: &str, positions: &str) -> String {
    format!("marketweft-dividend-ledger\t1\t{mode}\t{}\nDEMO:DIVIDEND\n{known}\n{shares}\n{REPORTS}{positions}",
        REPORTS.len())
}

#[test]
fn native_ledger_discloses_exact_events_and_rewinds_the_same_payments() {
    let fixed =
        |known| dividend_ledger_request(request("fixed", known, "100", "").as_bytes()).unwrap();
    let before = fixed("2025-06-02T14:04:59Z");
    assert!(before.starts_with("marketweft-dividend-ledger\t1\t0\nD\tDEMO:DIVIDEND\t"));
    assert_eq!(before.lines().count(), 2);
    let pay = fixed("2025-06-04T14:00:00Z");
    assert!(pay.starts_with("marketweft-dividend-ledger\t1\t3\n"));
    assert!(pay.contains("\tW=100000\tUSD,-50000000,40000000,0,40000000,10000000,10000000\n"));
    let revised = fixed("2025-06-04T14:40:00Z");
    assert!(revised.contains(
        "\tUSD,0,-43000000,0,0,-7000000,0\tCAD,0,48000000,0,48000000,12000000,12000000\n"
    ));
    assert_eq!(fixed("2025-06-04T14:00:00Z"), pay);
    let dated =
        dividend_ledger_request(request("dated", "2025-06-04T14:30:00Z", "", POSITIONS).as_bytes())
            .unwrap();
    assert!(dated.contains("\t120\tW=70000\tUSD,0,8600000,0,51600000,1400000,8400000\n"));
}

#[test]
fn installed_native_command_uses_the_exact_bounded_ledger_protocol() {
    let input = request("fixed", "2025-06-04T14:40:00Z", "100", "");
    let mut child = Command::new(env!("CARGO_BIN_EXE_marketweft-research"))
        .arg("dividend-ledger")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(input.as_bytes())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    assert_eq!(
        output.stdout,
        dividend_ledger_request(input.as_bytes())
            .unwrap()
            .into_bytes()
    );
    for invalid in [
        request("fixed", "", "100", POSITIONS),
        request("dated", "", "100", POSITIONS),
        request("fixed", "2025-02-29T14:40:00Z", "100", ""),
        request("fixed", "", "1000001", ""),
        input.replacen(&REPORTS.len().to_string(), "999999999", 1),
        input.replacen("DEMO:DIVIDEND", "demo:dividend", 1),
    ] {
        assert!(dividend_ledger_request(invalid.as_bytes()).is_err());
    }
    assert!(dividend_ledger_request(&vec![0; MAX_DIVIDEND_LEDGER_REQUEST_BYTES + 1]).is_err());
}
