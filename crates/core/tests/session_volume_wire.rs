use marketweft_core::research::{
    session_relative_volume_request, MAX_SESSION_VOLUME_REQUEST_BYTES,
};
use std::io::Write;
use std::process::{Command, Stdio};

const CALENDAR: &str = include_str!("fixtures/synthetic-session-volume-calendar.csv");
const BARS: &str = include_str!("fixtures/synthetic-session-volume-bars.csv");

fn request(calendar: &str, known: &str) -> String {
    format!(
        "marketweft-session-relative-volume\t1\t{}\t60\t2\t{known}\n{calendar}{BARS}",
        calendar.len(),
    )
}

#[test]
fn native_session_volume_matches_exact_cutoffs_and_rejects_invalid_wire() {
    let run = |known| session_relative_volume_request(request(CALENDAR, known).as_bytes()).unwrap();
    let before = run("2025-10-31T13:30:59Z");
    assert!(before.starts_with("marketweft-session-relative-volume\t1\t0\nS\t60\t2\t"));
    assert_eq!(before.lines().count(), 2);
    let at_close = run("2025-11-05T14:31:00Z");
    assert!(at_close.starts_with("marketweft-session-relative-volume\t1\t8\n"));
    assert!(at_close.ends_with("\t0\t60\t2\t2\t450000000\t300000000\t150000000\t3000000\n"));
    let later = run("2025-11-05T14:33:00Z");
    let rows: Vec<_> = later.split_terminator('\n').collect();
    assert!(rows[10].ends_with("\t60\t60\t2\t0\t100000000\t0\t\t"));
    assert!(rows[11].ends_with("\t120\t60\t2\t1\t10000000\t0\t0\t"));
    assert_eq!(run("2025-11-05T14:31:00Z"), at_close);
    let bom_calendar = format!("\u{feff}{CALENDAR}");
    let with_bom = request(&bom_calendar, "2025-11-05T14:31:00Z");
    assert_eq!(
        session_relative_volume_request(with_bom.as_bytes()).unwrap(),
        at_close
    );
    for invalid in [
        with_bom.replacen(&format!("\t{}\t", bom_calendar.len()), "\t1\t", 1),
        with_bom.replacen("\t1\t", "\t2\t", 1),
        with_bom.replacen("\t60\t2\t", "\t0\t2\t", 1),
        with_bom.replacen("\t60\t2\t", "\t60\t10001\t", 1),
        request(CALENDAR, "2025-02-29T14:31:00Z"),
    ] {
        assert!(session_relative_volume_request(invalid.as_bytes()).is_err());
    }
    assert!(
        session_relative_volume_request(&vec![0; MAX_SESSION_VOLUME_REQUEST_BYTES + 1]).is_err()
    );
}

#[test]
fn installed_native_session_volume_command_uses_the_shared_response() {
    let input = request(CALENDAR, "2025-11-07T14:31:00Z");
    let mut child = Command::new(env!("CARGO_BIN_EXE_marketweft-research"))
        .arg("session-relative-volume")
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
    let response = session_relative_volume_request(input.as_bytes()).unwrap();
    assert!(response.ends_with("\t315000000\t450000000\t450000000\t700000\n"));
    assert_eq!(output.stdout, response.into_bytes());
}
