//! Fixed-point, bar-close calculations shared by native consumers and WebAssembly.

mod history;
mod indicator;
mod replay;
#[cfg(target_arch = "wasm32")]
mod wasm;

pub use history::{parse_csv, Bar};
pub use indicator::{indicator, Average};
pub use replay::{parse_sessions, replay, EventKind, ReplayEvent, Session};

pub const SCALE: i64 = 1_000_000;
/// Bound keeps each six-place tick distinguishable through the browser number boundary.
pub const MAX_TICKS: i64 = 2_000_000_000 * SCALE;
pub const MAX_BARS: usize = 100_000;
pub const MAX_INPUT_BYTES: usize = 8 * 1024 * 1024;

/// The same ticker on different venues is a different instrument.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct Instrument {
    pub venue: String,
    pub symbol: String,
}

impl Instrument {
    pub fn new(venue: &str, symbol: &str) -> Result<Self, String> {
        fn component(value: &str) -> Result<String, String> {
            let value = value.trim();
            if !(1..=32).contains(&value.len())
                || !value
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"._-/".contains(&c))
            {
                return Err("Use 1–32 ASCII letters, digits, dots, underscores, hyphens or slashes for each instrument component.".into());
            }
            Ok(value.to_ascii_uppercase())
        }
        Ok(Self {
            venue: component(venue)?,
            symbol: component(symbol)?,
        })
    }
}

impl std::fmt::Display for Instrument {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}:{}", self.venue, self.symbol)
    }
}
