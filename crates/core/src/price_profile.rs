use super::{FlowVolume, TradeTape};
use std::{cmp::Reverse, collections::BTreeMap};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceProfile {
    pub levels: Vec<ProfileLevel>,
    pub volume: Option<ProfileArea>,
    pub time_opportunities: Option<ProfileArea>,
    pub observed_brackets: u32,
    pub value_area_basis_points: u16,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ProfileLevel {
    pub price_from: i64,
    pub price_to: i64,
    pub volume: FlowVolume,
    /// Distinct time brackets with at least one eligible trade in this price bin.
    pub opportunities: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ProfileArea {
    pub point_of_control_from: i64,
    pub point_of_control_to: i64,
    pub value_from: i64,
    pub value_to: i64,
    pub covered: i128,
    pub total: i128,
}

impl TradeTape {
    /// Sum the same observed execution-window footprint into a price profile.
    pub fn price_profile(
        &self,
        bracket_seconds: u32,
        price_width: i64,
        from_at: i64,
        through_at: i64,
        known_at: i64,
        value_area_basis_points: u16,
    ) -> Result<PriceProfile, String> {
        if !(1..=10_000).contains(&value_area_basis_points) {
            return Err("Use a value-area target from 1 to 10,000 basis points.".into());
        }
        let brackets =
            self.footprint(bracket_seconds, price_width, from_at, through_at, known_at)?;
        let observed_brackets = brackets.len() as u32;
        let mut bins = BTreeMap::new();
        for bracket in brackets {
            for level in bracket.levels {
                let row = bins.entry(level.price_from).or_insert(ProfileLevel {
                    price_from: level.price_from,
                    price_to: level.price_to,
                    volume: FlowVolume::default(),
                    opportunities: 0,
                });
                row.opportunities += 1;
                row.volume.buy += level.volume.buy;
                row.volume.sell += level.volume.sell;
                row.volume.unknown += level.volume.unknown;
                row.volume.trades += level.volume.trades;
            }
        }
        let levels: Vec<_> = bins.into_values().collect();
        Ok(PriceProfile {
            volume: area(&levels, value_area_basis_points, |bin| bin.volume.total()),
            time_opportunities: area(&levels, value_area_basis_points, |bin| {
                i128::from(bin.opportunities)
            }),
            levels,
            observed_brackets,
            value_area_basis_points,
        })
    }
}

fn area(
    levels: &[ProfileLevel],
    target: u16,
    weight: impl Fn(&ProfileLevel) -> i128,
) -> Option<ProfileArea> {
    let weights: Vec<_> = levels.iter().map(weight).collect();
    let total: i128 = weights.iter().sum();
    let (point, mut covered) = weights
        .iter()
        .copied()
        .enumerate()
        .max_by_key(|&(index, weight)| (weight, Reverse(index)))?;
    let (mut low, mut high) = (point, point);
    while covered * 10_000 < total * i128::from(target) {
        let below = low.checked_sub(1).and_then(|index| weights.get(index));
        let above = weights.get(high + 1);
        match (below, above) {
            (Some(below), Some(above)) if above > below => {
                high += 1;
                covered += above;
            }
            (Some(below), _) => {
                low -= 1;
                covered += below;
            }
            (None, Some(above)) => {
                high += 1;
                covered += above;
            }
            (None, None) => break,
        }
    }
    Some(ProfileArea {
        point_of_control_from: levels[point].price_from,
        point_of_control_to: levels[point].price_to,
        value_from: levels[low].price_from,
        value_to: levels[high].price_to,
        covered,
        total,
    })
}
