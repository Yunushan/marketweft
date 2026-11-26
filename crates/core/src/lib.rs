//! Fixed-point, bar-close calculations shared by native consumers and WebAssembly.

mod actions;
mod alerts;
mod backtest;
mod delisting;
mod depth;
mod dividend;
mod drawing;
mod fundamentals;
mod history;
mod indicator;
mod macro_calendar;
mod option_chain;
mod option_price;
mod paper;
mod paper_replay;
mod portfolio;
mod replay;
mod scenarios;
mod screen;
mod sector;
mod tick_bars;
mod timeframe;
mod universe;
mod walk_forward;
#[cfg(target_arch = "wasm32")]
mod wasm;

pub use actions::{
    parse_split_revisions, parse_splits, ShareRatio, Split, SplitBook, SplitRevision,
    SplitRevisionBook, MAX_SPLIT_ROWS,
};
pub use alerts::{
    AlertBook, AlertDirection, AlertNotification, AlertRule, Comparator, Observation,
};
pub use backtest::{backtest, BacktestConfig, BacktestMark, BacktestReport, BacktestSignal};
pub use delisting::{
    parse_delistings, CashOffer, DelistingBook, DelistingCashPosting, DelistingState,
    DelistingTerms, DelistingValuation, ReferenceClose,
};
pub use depth::{DepthLevel, DepthStamp, DepthStatus, DepthTape, DepthView};
pub use dividend::{
    parse_dividend_positions, parse_dividends, Dividend, DividendBook, DividendEvent, DividendKind,
    DividendMovement, DividendPositions, PositionObservation,
};
pub use drawing::{measure_drawing, DrawingEndpoint, DrawingMeasurement};
pub use fundamentals::{Filing, FinancialBook, MarketCap, Multiple, Valuation};
pub use history::{parse_csv, Bar};
pub use indicator::{indicator, Average};
pub use macro_calendar::{MacroCalendar, ReleaseRecord, ReleaseSnapshot, ReportKind};
pub use option_chain::{
    ChainSnapshot, Contract, OptionBook, OptionBookError, OptionQuote, OptionRow, QuoteStatus,
    Underlying, UnderlyingQuote,
};
pub use option_price::{EuropeanOption, ModelError, OptionAnalytics, OptionSide};
pub use paper::{
    Action as PaperAction, Apply as PaperApply, LedgerError as PaperError, Order as PaperOrder,
    OrderStatus as PaperOrderStatus, PaperAccount, PaperConfig, PaperEvent, PaperReceipt,
    Position as PaperPosition, Rejection as PaperRejection, Side as PaperSide,
};
pub use paper_replay::{parse_paper_config, PaperReplay};
pub use portfolio::{
    PortfolioBook, PortfolioCurrency, PortfolioDividendRow, PortfolioDividendState,
    PortfolioIncomeCurrency, PortfolioIncomeSnapshot, PortfolioRow, PortfolioSnapshot,
    PortfolioState,
};
pub use replay::{parse_sessions, replay, EventKind, ReplayEvent, Session};
pub use scenarios::{run_scenarios, ScenarioConfig, ScenarioReport, ScenarioStats, ThreeQuantiles};
pub use screen::{PriceBook, PriceObservation, RelativeLegPoint, RelativePoint, ScreenRow};
pub use sector::{Classification, Heatmap, HeatmapListing, SectorGroup};
pub use tick_bars::{
    FlowVolume, FootprintBar, FootprintLevel, PriceProfile, ProfileArea, ProfileLevel, TickBar,
    TradeTape, TradeWindow,
};
pub use timeframe::{
    aggregate_session_timeframe, aggregate_timeframe, SessionTimeframeBar, TimeframeBar,
};
pub use universe::{parse_universe, UniverseAction, UniverseBook, UniverseChange};
pub use walk_forward::{
    walk_forward, CandidateScore, SmaCandidate, WalkForwardConfig, WalkForwardFold,
};

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
