//! Fixed-point, bar-close calculations shared by native consumers and WebAssembly.

mod actions;
mod alerts;
mod anchored_twap;
mod anchored_vwap;
mod aroon;
mod atr;
mod atr_overlays;
mod backtest;
mod bollinger;
mod bollinger_measures;
mod candle_patterns;
mod chaikin;
mod chart_movement;
mod choppiness_and_smi;
mod close_change;
mod close_distribution;
mod close_swings;
mod cross_section;
mod cross_section_liquidity;
mod cumulative_volume;
mod delisting;
mod depth;
mod directional;
mod displaced_price_and_mass;
mod dividend;
mod donchian;
mod drawing;
mod financial_wire;
mod floor_pivots;
mod force_and_volatility;
mod formula;
mod formula_walk;
mod fundamentals;
mod fx;
mod fx_wire;
mod heikin_ashi;
mod history;
mod indicator;
mod kagi;
mod keltner;
mod line_break;
mod macd;
mod macro_calendar;
mod macro_wire;
mod monthly_returns;
mod moving_averages;
mod normalized_indicators;
mod option_cash;
mod option_chain;
mod option_price;
mod option_wire;
mod paper;
mod paper_replay;
mod point_figure;
mod portfolio;
mod portfolio_scenario_wire;
mod price_momentum;
mod provider_history;
mod range_bars;
mod range_oscillators;
mod range_position;
mod regression_channel;
mod renko;
mod replay;
pub mod research;
mod rsi;
mod scalar_plugin;
mod scenarios;
mod screen;
mod sector;
mod stochastic;
mod tick_bars;
mod timeframe;
mod ultimate;
mod universe;
mod vigor_and_demarker;
mod volume_bars;
mod walk_forward;
#[cfg(target_arch = "wasm32")]
mod wasm;
mod weighted_volume;
mod wilder;

pub use actions::{
    parse_split_revisions, parse_splits, ShareRatio, Split, SplitBook, SplitRevision,
    SplitRevisionBook, MAX_SPLIT_ROWS,
};
pub use alerts::{
    AlertBook, AlertDirection, AlertNotification, AlertRule, Comparator, Observation,
};
pub use anchored_twap::{anchored_twap, AnchoredTwapPoint};
pub use anchored_vwap::{anchored_vwap, AnchoredVwapPoint};
pub use aroon::{aroon, AroonValue};
pub use atr::average_true_range;
pub use atr_overlays::{chandelier_exit, supertrend, ChandelierExit, SupertrendPoint};
pub use backtest::{
    backtest, backtest_with_formulas, backtest_with_trades, validate_formula_strategy,
    validate_formula_strategy_with_library, BacktestConfig, BacktestMark, BacktestReport,
    BacktestSignal, FormulaBacktestConfig, FormulaBacktestReport, FormulaBacktestSignal,
    RecordedBacktestCutoffs,
};
pub use bollinger::PriceBand as BollingerBand;
pub use bollinger::{bollinger_bands, PriceBand};
pub use bollinger_measures::{bollinger_measures, BollingerMeasures};
pub use candle_patterns::{replay_candle_patterns, CandlePattern, CandlePatternHit};
pub use chaikin::{chaikin_money_flow, chaikin_oscillator};
pub use chart_movement::PriceMovement;
pub use choppiness_and_smi::{
    choppiness_index, stochastic_momentum_index, StochasticMomentumValue,
};
pub use close_change::{close_changes, opening_gaps, OpeningGap};
pub use close_distribution::{observed_close_distributions, CloseDistribution};
pub use close_swings::{confirmed_close_swings, ConfirmedSwing, SwingSide};
pub use cross_section::{
    CrossSectionActionSources, CrossSectionCandidate, CrossSectionCapitalReturnClaim,
    CrossSectionCapitalReturnPosting, CrossSectionConfig, CrossSectionDelistingClaim,
    CrossSectionDelistingPosting, CrossSectionDividendPosting, CrossSectionEvent, CrossSectionFold,
    CrossSectionPosition, CrossSectionReport, CrossSectionScore, CrossSectionSuccessorClaim,
    CrossSectionSuccessorPosting, CrossSectionWalkConfig, RankingDecision,
};
pub use cross_section_liquidity::{LiquidityTape, ReplayLiquidity};
pub use cumulative_volume::{cumulative_volume, price_volume_trend, CumulativeVolume};
pub use delisting::{
    parse_delistings, CashOffer, DelistingBook, DelistingCashPosting, DelistingState,
    DelistingTerms, DelistingValuation, ReferenceClose,
};
pub use depth::{
    BestQuote, DepthExecution, DepthLevel, DepthStamp, DepthStatus, DepthSweep, DepthTape,
    DepthView, PaperDepthReplay, PaperDepthReport, StampedDepthLevel,
};
pub use directional::{adx_rating, directional_movement, DirectionalMovement};
pub use displaced_price_and_mass::{detrended_price_oscillator, mass_index};
pub use dividend::{
    parse_dividend_positions, parse_dividends, Dividend, DividendBook, DividendEvent, DividendKind,
    DividendMovement, DividendPositions, PositionObservation,
};
pub use donchian::donchian_channels;
pub use drawing::{
    fibonacci_channel_levels, fibonacci_circle_levels, gann_box_levels, gann_fan_levels,
    measure_drawing, measure_risk_reward, DrawingEndpoint, DrawingMeasurement,
    FibonacciChannelLevel, FibonacciCircleLevel, GannFanLevel, RiskRewardMeasurement,
    RiskRewardSide,
};
pub use floor_pivots::{daily_floor_pivots, FloorPivotLevels};
pub use force_and_volatility::{
    chaikin_volatility, elder_force_index, elder_ray_index, ElderRayValue,
};
pub use formula::{Formula, FormulaFunctionDefinition, FormulaLibrary, FORMULA_VERSION};
pub use formula_walk::{
    walk_forward_formulas, FormulaWalkCandidate, FormulaWalkConfig, FormulaWalkFold,
    FormulaWalkScore,
};
pub use fundamentals::{
    Filing, FinancialBook, MarketCap, Multiple, QuarterlyFinancials, QuarterlyValuation,
    TrailingFourQuarters, Valuation,
};
pub use fx::{FxAmount, FxBook, FxCurrencyValue, FxRateEvidence, FxTranslation};
pub use heikin_ashi::heikin_ashi;
pub use history::{exact_utc as parse_exact_utc, parse_csv, Bar};
pub use indicator::{indicator, Average};
pub use kagi::{kagi, KagiSegment, KagiWeight};
pub use keltner::keltner_channels;
pub use line_break::three_line_break;
pub use macd::{macd, MacdValue};
pub use macro_calendar::{MacroCalendar, ReleaseRecord, ReleaseSnapshot, ReportKind};
pub use monthly_returns::{
    monthly_returns, MonthWindow, MonthlyClose, MonthlyReturn, MAX_MONTHLY_RETURN_YEARS,
};
pub use moving_averages::{
    double_exponential_moving_average, hull_moving_average, kaufman_adaptive_moving_average,
    kaufman_efficiency_ratio, linearly_weighted_average, triple_exponential_moving_average,
};
pub use normalized_indicators::{
    normalized_average_true_range, percentage_price_oscillator, PpoValue,
};
pub use option_cash::CashOptionDividend;
pub use option_chain::{
    AmericanCashImpliedRequest, AmericanCashImpliedValuation, AmericanCashRequest,
    AmericanCashValuation, AmericanValuation, AmericanValuationRequest, CashOptionError,
    ChainSnapshot, Contract, ExerciseStyle, OptionBook, OptionBookError, OptionQuote, OptionRow,
    QuoteStatus, Underlying, UnderlyingQuote,
};
pub use option_price::{
    AmericanImplied, EuropeanOption, ModelError, OptionAnalytics, OptionSide, OptionTerms,
    MAX_AMERICAN_STEPS,
};
pub use paper::{
    Action as PaperAction, Apply as PaperApply, LedgerError as PaperError, Order as PaperOrder,
    OrderStatus as PaperOrderStatus, PaperAccount, PaperConfig, PaperEvent, PaperReceipt,
    Position as PaperPosition, Rejection as PaperRejection, Side as PaperSide,
};
pub use paper_replay::{parse_paper_config, PaperReplay};
pub use point_figure::{point_and_figure, PointFigureBox, PointFigureMark};
pub use portfolio::{
    compare_portfolio_capital_returns, portfolio_capital_returns_as_of, portfolio_rights_as_of,
    portfolio_rights_exercises_as_of, portfolio_rights_settlement_journal,
    portfolio_spin_off_basis_as_of, portfolio_spin_off_cash_as_of, portfolio_spin_offs_as_of,
    portfolio_successor_delivery_ledger, portfolio_successor_shares_as_of, CapitalReturnAmounts,
    CapitalReturnBasis, CapitalReturnComparison, CapitalReturnCutoff, CapitalReturnMovement,
    ChildShares, EquityConcentration, EquityConcentrationChange, EquityConcentrationPosition,
    EquityTargetBook, EquityTargetChange, EquityTargetDrift, EquityTargetReport, PortfolioBook,
    PortfolioCapitalReturn, PortfolioCurrency, PortfolioDividendRow, PortfolioDividendState,
    PortfolioIncomeCurrency, PortfolioIncomeSnapshot, PortfolioRow, PortfolioSnapshot,
    PortfolioSpinOffReport, PortfolioSpinOffRow, PortfolioSpinOffState, PortfolioState,
    RightsEntitlement, RightsExerciseAllocation, RightsExerciseRow, RightsExerciseSettlement,
    RightsExerciseStage, RightsFractionPolicy, RightsOfferingPhase, RightsOfferingRow,
    RightsOfferingTerms, RightsRequestAssessment, RightsSettlementAsset, RightsSettlementPosting,
    SpinOffBasisAllocation, SpinOffBasisRow, SpinOffBasisState, SpinOffBasisTerms, SpinOffCashRow,
    SpinOffCashState, SpinOffCashTerms, SuccessorDeliveryPosting, SuccessorShareDelta,
    SuccessorShareRow, SuccessorShareState, SuccessorShareTerms,
};
pub use price_momentum::{
    chande_momentum_oscillator, commodity_channel_index, coppock_curve, observed_drawdown,
    psychological_line, rate_of_change, rebased_percent_changes, trix, vertical_horizontal_filter,
    DrawdownPoint,
};
pub use provider_history::{ProviderBar, ProviderHistory, ProviderObservation};
pub use range_bars::RangeBar;
pub use range_oscillators::{balance_of_power, vortex_indicator, VortexValue};
pub use range_position::williams_percent_r;
pub use regression_channel::{
    regression_channel, rolling_close_regression, CloseRegressionValues, RegressionChannel,
};
pub use renko::renko;
pub use scalar_plugin::{
    evaluate_scalar_plugin, evaluate_scalar_plugin_series, ScalarPluginPoint,
    MAX_SCALAR_PLUGIN_BYTES, MAX_SCALAR_PLUGIN_SERIES_BARS,
};
pub use weighted_volume::{
    money_flow_index, volume_oscillator, volume_rate_of_change, volume_weighted_average,
};
pub type RenkoBrick = PriceMovement;
pub use replay::{parse_sessions, replay, EventKind, ReplayEvent, Session};
pub use rsi::relative_strength_index;
pub use scenarios::{run_scenarios, ScenarioConfig, ScenarioReport, ScenarioStats, ThreeQuantiles};
pub use screen::{
    ListingRiskPoint, ListingRiskQuery, PortfolioScenarioConfig, PortfolioScenarioPath,
    PortfolioScenarioReport, PriceBook, PriceObservation, RelativeLegPoint, RelativePoint,
    ScenarioAllocation, ScenarioCoverage, ScreenComparisonLeg, ScreenComparisonRow, ScreenCutoff,
    ScreenRow,
};
pub use sector::{Classification, Heatmap, HeatmapComparison, HeatmapListing, SectorGroup};
pub use stochastic::{stochastic_oscillator, stochastic_rsi, StochasticValue};
pub use tick_bars::{
    AggressorSide, FlowVolume, FootprintBar, FootprintLevel, PriceProfile, ProfileArea,
    ProfileLevel, TickBar, TradeClassification, TradeClassificationConfig, TradeSideBasis,
    TradeTape, TradeWindow,
};
pub use timeframe::{
    aggregate_session_timeframe, aggregate_timeframe, SessionTimeframeBar, TimeframeBar,
};
pub use ultimate::ultimate_oscillator;
pub use universe::{parse_universe, UniverseAction, UniverseBook, UniverseChange};
pub use vigor_and_demarker::{demarker, relative_vigor, RelativeVigorValue};
pub use volume_bars::VolumeBar;
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
