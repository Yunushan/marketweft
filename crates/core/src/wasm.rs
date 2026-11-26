//! Single-threaded, synchronous ABI. The host copies input after mw_input and
//! reads output before its next call. No Rust allocation is owned by JavaScript.
use crate::{history::exact_utc, parse_universe, PriceBook};
use crate::{
    indicator, parse_csv, parse_dividends, parse_sessions, parse_splits, replay, Average, Bar,
    Instrument, Split, SplitBook, MAX_BARS, MAX_INPUT_BYTES, MAX_SPLIT_ROWS,
};
use std::cell::RefCell;

thread_local! {
    static INPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static OUTPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[no_mangle]
pub extern "C" fn mw_dividend_ledger(shares: u32) -> u32 {
    use std::fmt::Write;
    process(|input| {
        let (identity, csv) = utf8(input)?
            .split_once('\n')
            .ok_or("Missing cash dividend data.")?;
        let (venue, symbol) = identity
            .split_once(':')
            .ok_or("Missing replay instrument.")?;
        let book = parse_dividends(csv, &Instrument::new(venue, symbol)?)?;
        let mut text = String::new();
        for event in book.ledger(shares)? {
            let row = event.revision;
            write!(
                &mut text,
                "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                event.at,
                event.kind as u8,
                row.id,
                row.announced_at,
                row.ex_at,
                row.pay_at,
                row.observed_at,
                row.currency,
                row.amount_per_share
            )
            .unwrap();
            for movement in event.movements {
                write!(
                    &mut text,
                    "\t{},{},{},{},{}",
                    movement.currency,
                    movement.receivable_delta,
                    movement.cash_delta,
                    movement.receivable,
                    movement.cash
                )
                .unwrap();
            }
            text.push('\n');
        }
        Ok(text.into_bytes())
    })
}

#[no_mangle]
pub extern "C" fn mw_version() -> u32 {
    1
}

#[no_mangle]
pub extern "C" fn mw_input(len: usize) -> *mut u8 {
    if len > MAX_INPUT_BYTES {
        return std::ptr::null_mut();
    }
    INPUT.with_borrow_mut(|v| {
        v.resize(len, 0);
        v.as_mut_ptr()
    })
}

#[no_mangle]
pub extern "C" fn mw_output() -> *const u8 {
    OUTPUT.with_borrow(|v| v.as_ptr())
}

#[no_mangle]
pub extern "C" fn mw_output_len() -> usize {
    OUTPUT.with_borrow(|v| v.len())
}

fn process(f: impl FnOnce(&[u8]) -> Result<Vec<u8>, String>) -> u32 {
    let result = INPUT.with_borrow(|v| f(v));
    let (status, bytes) = match result {
        Ok(bytes) => (0, bytes),
        Err(message) => (1, message.into_bytes()),
    };
    OUTPUT.with_borrow_mut(|out| *out = bytes);
    status
}

fn utf8(bytes: &[u8]) -> Result<&str, String> {
    std::str::from_utf8(bytes).map_err(|_| "Input must be UTF-8.".into())
}

#[no_mangle]
pub extern "C" fn mw_universe_index() -> u32 {
    use std::fmt::Write;
    process(|input| {
        let book = parse_universe(utf8(input)?)?;
        let mut text = String::from(book.name());
        for cutoff in book.checkpoints() {
            write!(&mut text, "\n{cutoff}").unwrap();
        }
        Ok(text.into_bytes())
    })
}

#[no_mangle]
pub extern "C" fn mw_universe_as_of() -> u32 {
    use std::fmt::Write;
    process(|input| {
        let mut parts = utf8(input)?.splitn(3, '\n');
        let mut cutoff = || {
            parts
                .next()
                .and_then(exact_utc)
                .ok_or("Both cutoffs require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.")
        };
        let effective_at = cutoff()?;
        let known_at = cutoff()?;
        let book = parse_universe(parts.next().ok_or("Missing universe reports.")?)?;
        let mut text = String::new();
        for row in book.as_of(effective_at, known_at) {
            writeln!(
                &mut text,
                "{}\t{}\t{}\t{}\t{}\t{}",
                row.listing_id,
                row.instrument,
                row.action as u8,
                row.change_id,
                row.effective_at,
                row.observed_at
            )
            .unwrap();
        }
        Ok(text.into_bytes())
    })
}

#[no_mangle]
pub extern "C" fn mw_universe_screen(membership_bytes: usize) -> u32 {
    use std::fmt::Write;
    process(|input| {
        let ([baseline_at, effective_at, known_at], csvs) = screen_inputs(input)?;
        let (membership, closes) = csvs
            .split_at_checked(membership_bytes)
            .ok_or("Supply both membership and price reports.")?;
        let universe = parse_universe(membership)?;
        let prices = PriceBook::parse(&universe, closes)?;
        let mut text = String::new();
        for row in prices.screen(baseline_at, effective_at, known_at)? {
            write!(
                &mut text,
                "{}\t{}\t",
                row.listing.listing_id, row.listing.instrument
            )
            .unwrap();
            if let (Some(rank), Some(change)) = (row.rank, row.return_units) {
                write!(&mut text, "{rank}\t{change}").unwrap();
            } else {
                text.push('\t');
            }
            for price in [row.baseline, row.current] {
                text.push('\t');
                if let Some(price) = price {
                    write!(&mut text, "{},{}", price.ticks, price.observed_at).unwrap();
                }
            }
            text.push('\n');
        }
        Ok(text.into_bytes())
    })
}

fn screen_inputs(input: &[u8]) -> Result<([i64; 3], &str), String> {
    let mut parts = utf8(input)?.splitn(4, '\n');
    let mut times = [0; 3];
    for time in &mut times {
        *time = parts
            .next()
            .and_then(exact_utc)
            .ok_or("Screen times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.")?;
    }
    Ok((
        times,
        parts.next().ok_or("Supply the universe CSV reports.")?,
    ))
}

#[no_mangle]
pub extern "C" fn mw_sector_heatmap(membership_bytes: usize, price_bytes: usize) -> u32 {
    use std::fmt::Write;
    process(|input| {
        let ([baseline_at, effective_at, known_at], csvs) = screen_inputs(input)?;
        let (membership, rest) = csvs
            .split_at_checked(membership_bytes)
            .ok_or("Supply membership, price and sector reports.")?;
        let (closes, metadata) = rest
            .split_at_checked(price_bytes)
            .ok_or("Supply both price and sector reports.")?;
        let universe = parse_universe(membership)?;
        let prices = PriceBook::parse(&universe, closes)?;
        let map = prices.heatmap(metadata, baseline_at, effective_at, known_at)?;
        let mut text = String::new();
        writeln!(
            &mut text,
            "H\t{}\t{}\t{}",
            map.known_weight,
            map.covered_weight,
            optional_number(map.contribution)
        )
        .unwrap();
        for group in map.groups {
            writeln!(
                &mut text,
                "S\t{}\t{}\t{}\t{}\t{}",
                group.sector.as_deref().unwrap_or_default(),
                group.known_weight,
                group.covered_weight,
                optional_number(group.weighted_return),
                optional_number(group.contribution)
            )
            .unwrap();
            for listing in group.listings {
                let rank = listing.ranking;
                let report = listing.classification.as_ref();
                writeln!(
                    &mut text,
                    "L\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                    rank.listing.listing_id,
                    rank.listing.instrument,
                    optional_number(rank.rank),
                    optional_number(rank.return_units),
                    optional_number(report.and_then(|r| r.weight)),
                    optional_number(report.map(|r| r.effective_at)),
                    optional_number(report.map(|r| r.observed_at)),
                    optional_number(listing.contribution)
                )
                .unwrap();
            }
        }
        Ok(text.into_bytes())
    })
}

fn optional_number(value: Option<impl ToString>) -> String {
    value.map(|number| number.to_string()).unwrap_or_default()
}

fn encode_bars(bars: Vec<Bar>) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(48 * bars.len());
    for bar in bars {
        for value in [bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume] {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
    }
    bytes
}

#[no_mangle]
pub extern "C" fn mw_parse() -> u32 {
    process(|input| Ok(encode_bars(parse_csv(utf8(input)?)?)))
}

#[no_mangle]
pub extern "C" fn mw_instrument() -> u32 {
    process(|input| {
        let (venue, symbol) = utf8(input)?
            .split_once('\n')
            .ok_or("Missing venue or symbol.")?;
        Ok(Instrument::new(venue, symbol)?.to_string().into_bytes())
    })
}

// Split records occupy 32 bytes. All numbers in the bridge are little-endian.
#[no_mangle]
pub extern "C" fn mw_split_book() -> u32 {
    process(|input| {
        let (identity, csv) = utf8(input)?
            .split_once('\n')
            .ok_or("Missing corporate actions data.")?;
        let (venue, symbol) = identity
            .split_once(':')
            .ok_or("Missing replay instrument.")?;
        let book = parse_splits(csv, &Instrument::new(venue, symbol)?)?;
        let mut bytes = Vec::with_capacity(book.records().len() * 32);
        for split in book.records() {
            for value in [split.announced_at, split.effective_at, split.observed_at] {
                bytes.extend_from_slice(&value.to_le_bytes());
            }
            bytes.extend_from_slice(&split.new_shares.to_le_bytes());
            bytes.extend_from_slice(&split.old_shares.to_le_bytes());
        }
        Ok(bytes)
    })
}

#[no_mangle]
pub extern "C" fn mw_adjust_splits(records: usize) -> u32 {
    process(|input| {
        if records > MAX_SPLIT_ROWS {
            return Err("Too many split records.".into());
        }
        let (clock, input) = input
            .split_first_chunk::<8>()
            .ok_or("Missing observation time.")?;
        let (splits, bars) = input
            .split_at_checked(records * 32)
            .ok_or("Invalid split record count.")?;
        let (bar_rows, trailing) = bars.as_chunks::<48>();
        if !trailing.is_empty() || bar_rows.len() > MAX_BARS {
            return Err("Invalid series length.".into());
        }
        let read_i64 = |bytes: &[u8], offset: usize| {
            i64::from_le_bytes(bytes[offset..offset + 8].try_into().unwrap())
        };
        let read_u32 = |bytes: &[u8], offset: usize| {
            u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap())
        };
        let (split_rows, _) = splits.as_chunks::<32>();
        let book = SplitBook::new(
            split_rows
                .iter()
                .map(|row| Split {
                    announced_at: read_i64(row, 0),
                    effective_at: read_i64(row, 8),
                    observed_at: read_i64(row, 16),
                    new_shares: read_u32(row, 24),
                    old_shares: read_u32(row, 28),
                })
                .collect(),
        )?;
        let bars: Vec<_> = bar_rows
            .iter()
            .map(|row| Bar {
                time: read_i64(row, 0),
                open: read_i64(row, 8),
                high: read_i64(row, 16),
                low: read_i64(row, 24),
                close: read_i64(row, 32),
                volume: read_i64(row, 40),
            })
            .collect();
        Ok(encode_bars(book.adjust(&bars, i64::from_le_bytes(*clock))?))
    })
}

#[no_mangle]
pub extern "C" fn mw_indicator(kind: u32, period: usize) -> u32 {
    process(|input| {
        let (values, trailing) = input.as_chunks::<8>();
        if !trailing.is_empty() || values.len() > MAX_BARS {
            return Err("Invalid series length.".into());
        }
        let kind = match kind {
            0 => Average::Simple,
            1 => Average::Exponential,
            _ => return Err("Unknown indicator.".into()),
        };
        let closes: Vec<i64> = values.iter().copied().map(i64::from_le_bytes).collect();
        Ok(indicator(kind, period, &closes)?
            .into_iter()
            .flat_map(|v| v.unwrap_or(i64::MIN).to_le_bytes())
            .collect())
    })
}

#[no_mangle]
pub extern "C" fn mw_replay(calendar_bytes: usize, interval: u32) -> u32 {
    process(|input| {
        let (calendar, bar_bytes) = input
            .split_at_checked(calendar_bytes)
            .ok_or("Invalid calendar length.")?;
        let (values, trailing) = bar_bytes.as_chunks::<8>();
        if !trailing.is_empty() || values.len() > MAX_BARS {
            return Err("Invalid bar time series length.".into());
        }
        let sessions = parse_sessions(utf8(calendar)?)?;
        let times: Vec<i64> = values.iter().copied().map(i64::from_le_bytes).collect();
        let events = replay(&sessions, &times, interval)?;
        let mut bytes = Vec::with_capacity(events.len() * 32);
        for event in events {
            let session = sessions[event.session_index];
            bytes.extend_from_slice(&event.event_time.to_le_bytes());
            bytes.extend_from_slice(&event.observed_at.to_le_bytes());
            bytes.extend_from_slice(
                &event
                    .bar_index
                    .map_or(-1, |index| index as i32)
                    .to_le_bytes(),
            );
            bytes.extend_from_slice(&(event.session_index as u32).to_le_bytes());
            bytes.extend_from_slice(&session.utc_offset_minutes.to_le_bytes());
            let flags = event.kind as u32 | ((session.early_close as u32) << 8);
            bytes.extend_from_slice(&flags.to_le_bytes());
        }
        Ok(bytes)
    })
}
