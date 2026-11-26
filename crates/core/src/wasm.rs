//! Single-threaded, synchronous ABI. The host copies input after mw_input and
//! reads output before its next call. No Rust allocation is owned by JavaScript.
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
