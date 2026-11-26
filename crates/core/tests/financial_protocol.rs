use marketweft_core::research::{financial_snapshot_request, MAX_FINANCIAL_REQUEST_BYTES};

const FILINGS: &str = include_str!("fixtures/synthetic-financial-periods.csv");
const CAPS: &str = include_str!("fixtures/synthetic-financial-market-caps.csv");

fn request(known: &str) -> String {
    let length = FILINGS.len();
    format!("marketweft-financial\t1\t{length}\tDEMO-ALFA\t2025-04-03T14:00:00Z\t{known}\n{FILINGS}{CAPS}")
}

#[test]
fn native_financial_wire_contains_the_same_point_in_time_records_as_wasm() {
    let early = financial_snapshot_request(request("2025-04-03T14:04:59Z").as_bytes()).unwrap();
    assert!(early.starts_with("marketweft-financial\t1\tDEMO-ALFA\nF\tALFA-FY24\t"));
    assert!(early.contains(
        "T\tinsufficient-quarters\nU\tmissing-quarters\nU\tmissing-quarters\nU\tvalue\t4000000\n"
    ));
    assert!(!early.contains("Q\tALFA-Q2\t"));
    let complete = financial_snapshot_request(request("2025-04-03T14:05:00Z").as_bytes()).unwrap();
    assert!(complete.contains("Q\tALFA-Q2\t"));
    assert!(complete
        .contains("T\tavailable\tUSD\t6000000000000010\t1200000000000010\t700000000000003\n"));
    let revised = financial_snapshot_request(request("2025-04-03T14:22:00Z").as_bytes()).unwrap();
    assert!(revised.contains("F\tALFA-FY24-A1\t"));
    assert!(revised.contains("Q\tALFA-Q4-A1\t"));
    assert!(revised.contains("T\tavailable\tUSD\t8000000000000010\t\t-250000000000005\n"));
    assert!(
        revised.ends_with("U\tmissing-denominator\nU\tvalue\t1500000\nU\tmissing-denominator\n")
    );
}

#[test]
fn native_financial_wire_rejects_invalid_framing_and_cutoffs() {
    let valid = request("2025-04-03T14:22:00Z");
    for input in [
        valid.replacen("marketweft-financial\t1\t", "marketweft-financial\t2\t", 1),
        valid.replacen(&format!("\t{}\t", FILINGS.len()), "\t999999\t", 1),
        valid.replacen("14:22:00", "14:61:00", 1),
        valid.replacen("\tDEMO-ALFA\t", "\tFOREIGN\t", 1),
        "marketweft-financial\t1\t1\tDEMO-ALFA\t2025-04-03T14:00:00Z\t2025-04-03T14:22:00Z\né"
            .into(),
    ] {
        assert!(financial_snapshot_request(input.as_bytes()).is_err());
    }
    assert!(financial_snapshot_request(&vec![0; MAX_FINANCIAL_REQUEST_BYTES + 1]).is_err());
    assert!(financial_snapshot_request(&[0xFF]).is_err());
}
