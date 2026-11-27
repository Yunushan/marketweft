// Twelve additional decimal places keep the previous means between updates.
pub(crate) const PRECISION: i128 = 1_000_000_000_000;

pub(crate) fn rounded(numerator: i128, denominator: i128) -> i128 {
    (numerator + denominator / 2) / denominator
}

pub(crate) fn update(previous: i128, sample: i128, period: i128) -> i128 {
    rounded(previous * (period - 1) + sample, period)
}
