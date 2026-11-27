/// A price movement derived from an identified source bar. All prices are in millionths.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PriceMovement {
    pub source_time: i64,
    pub source_index: u32,
    pub open: i64,
    pub close: i64,
    pub source_close: i64,
}
