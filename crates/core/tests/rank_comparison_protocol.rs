use marketweft_core::research::compare_universe_ranks_request;

#[test]
fn rank_comparison_protocol_retains_two_cutoffs_and_exact_price_fields() {
    let membership = include_str!("fixtures/synthetic-universe.csv");
    let prices = include_str!("fixtures/synthetic-universe-prices.csv");
    let header = format!(
        "marketweft-rank-comparison\t1\t{}\t2025-06-02T14:00:00Z\t2025-06-02T14:10:00Z\t2025-06-02T14:12:00Z\t2025-06-02T14:10:00Z\t2025-06-02T14:16:00Z",
        membership.len()
    );
    let request = format!("{header}\n{membership}{prices}");
    let output = compare_universe_ranks_request(request.as_bytes()).unwrap();
    let mut lines = output.lines();
    assert_eq!(
        lines.next(),
        Some("marketweft-rank-comparison\t1\tDEMO-BASKET")
    );
    assert!(lines.next().unwrap().ends_with("\t1"));
    let beta: Vec<_> = lines.next().unwrap().split('\t').collect();
    assert_eq!(beta.len(), 13);
    assert_eq!(beta[0], "BETA-001");
    assert_eq!(beta[6], "56000000,1748873520");
    assert_eq!(beta[11], "50500000,1748873760");
    assert_eq!(beta[12], "-1");
    assert!(lines.next().is_none());
    assert!(
        compare_universe_ranks_request(request.replacen("\t1\t", "\t2\t", 1).as_bytes()).is_err()
    );
}
