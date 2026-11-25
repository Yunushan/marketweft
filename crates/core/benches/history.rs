use marketweft_core::{indicator, parse_csv, Average, MAX_BARS};
use std::fmt::Write;
use std::hint::black_box;
use std::time::Instant;

fn measure(label: &str, mut f: impl FnMut()) {
    f();
    let start = Instant::now();
    for _ in 0..10 {
        f();
    }
    let seconds = start.elapsed().as_secs_f64();
    println!(
        "{label}: {:.2} ms/pass, {:.0} bars/s (10 x {MAX_BARS})",
        seconds * 100.,
        10. * MAX_BARS as f64 / seconds
    );
}

fn main() {
    let mut csv = String::from("time,open,high,low,close,volume\n");
    for i in 0..MAX_BARS {
        writeln!(csv, "{i},100.10,102,99,101.12,1000.5").unwrap();
    }
    measure("CSV ingest", || {
        black_box(parse_csv(black_box(&csv)).unwrap());
    });
    let closes: Vec<_> = parse_csv(&csv).unwrap().iter().map(|b| b.close).collect();
    for (name, kind) in [
        ("SMA(20)", Average::Simple),
        ("EMA(20)", Average::Exponential),
    ] {
        measure(name, || {
            black_box(indicator(kind, 20, black_box(&closes)).unwrap());
        });
    }
}
