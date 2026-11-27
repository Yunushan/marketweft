use crate::{
    history::{decimal, exact_utc},
    screen::rounded_div,
    PriceBook, ScreenCutoff, ScreenRow, UniverseBook, SCALE,
};
use std::collections::BTreeMap;

const MAX_ROWS: usize = 10_000;
const MAX_BYTES: usize = 1024 * 1024;
const RETURN_SCALE: i128 = 1_000_000_000_000;
const DISPLAY_DIVISOR: i128 = RETURN_SCALE / 1_000_000;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Classification {
    pub sector: Option<String>,
    /// Portfolio weights expressed in millionths. Zero is an explicit weight.
    pub weight: Option<i64>,
    pub effective_at: i64,
    pub observed_at: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HeatmapListing<'a> {
    pub ranking: ScreenRow<'a>,
    pub classification: Option<Classification>,
    /// Contribution in 0.0001 percentage-point units.
    pub contribution: Option<i128>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SectorGroup<'a> {
    pub sector: Option<String>,
    pub listings: Vec<HeatmapListing<'a>>,
    pub known_weight: i64,
    pub covered_weight: i64,
    /// Weighted return and contribution in 0.0001 percentage-point units.
    pub weighted_return: Option<i128>,
    pub contribution: Option<i128>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Heatmap<'a> {
    pub groups: Vec<SectorGroup<'a>>,
    pub known_weight: i64,
    pub covered_weight: i64,
    pub contribution: Option<i128>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HeatmapComparison<'a> {
    pub before: Heatmap<'a>,
    pub after: Heatmap<'a>,
}

// Revisions share an effective time and are stored in ascending observation order.
type Timeline = BTreeMap<i64, Vec<Classification>>;
type Classifications = BTreeMap<String, Timeline>;

fn parse(universe: &UniverseBook, csv: &str) -> Result<Classifications, String> {
    if csv.len() > MAX_BYTES {
        return Err("Sector and weight CSV exceeds 1 MiB.".into());
    }
    let mut lines = csv
        .trim_start_matches('\u{feff}')
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty());
    if lines.next().map(|(_, row)| row.trim())
        != Some("universe,listing_id,effective_at,observed_at,sector,weight")
    {
        return Err(
            "Expected sector header universe,listing_id,effective_at,observed_at,sector,weight."
                .into(),
        );
    }
    let listing_ids = universe.listing_ids();
    let mut reports = Classifications::new();
    for (i, (line, row)) in lines.enumerate() {
        let error = |reason: &str| format!("Sector line {}: {reason}", line + 1);
        if i == MAX_ROWS {
            return Err(error("Supply at most 10,000 sector and weight reports."));
        }
        let fields: Vec<_> = row.split(',').map(str::trim).collect();
        let [name, listing, effective, observed, sector, weight] = fields.as_slice() else {
            return Err(error("Expected exactly six fields."));
        };
        if *name != universe.name() || !listing_ids.contains(listing) {
            return Err(error(
                "Universe and listing IDs must match the membership history.",
            ));
        }
        let effective_at =
            exact_utc(effective).ok_or_else(|| error("Use an exact UTC effective time."))?;
        let observed_at =
            exact_utc(observed).ok_or_else(|| error("Use an exact UTC observation time."))?;
        let sector = match *sector {
            "" => None,
            name if name.len() <= 40
                && name.bytes().any(|b| b.is_ascii_alphanumeric())
                && name
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b" ._-/&".contains(&b)) =>
            {
                Some(name.to_owned())
            }
            _ => {
                return Err(error(
                    "Use a sector of at most 40 ASCII letters, digits, spaces or ._-/&.",
                ))
            }
        };
        let weight = match *weight {
            "" => None,
            raw => Some(
                decimal(raw)
                    .filter(|w| !raw.starts_with('-') && (0..=SCALE).contains(w))
                    .ok_or_else(|| {
                        error("Weight must be between 0 and 1, with at most six decimal places.")
                    })?,
            ),
        };
        reports
            .entry((*listing).into())
            .or_default()
            .entry(effective_at)
            .or_default()
            .push(Classification {
                sector,
                weight,
                effective_at,
                observed_at,
            });
    }
    for (listing, timeline) in &mut reports {
        for revisions in timeline.values_mut() {
            revisions.sort_unstable_by_key(|report| report.observed_at);
            if revisions
                .windows(2)
                .any(|pair| pair[0].observed_at == pair[1].observed_at)
            {
                return Err(format!("Listing {listing} has duplicate sector observation times for one effective time."));
            }
        }
    }
    Ok(reports)
}

impl<'a> PriceBook<'a> {
    /// Group the exact screen constituents by their most recent effective, known classification.
    pub fn heatmap(
        &self,
        metadata: &str,
        baseline_at: i64,
        effective_at: i64,
        known_at: i64,
    ) -> Result<Heatmap<'a>, String> {
        let reports = parse(self.universe, metadata)?;
        self.heatmap_at(&reports, baseline_at, effective_at, known_at)
    }

    /// Compare two snapshots of the same classified universe under independent cutoffs.
    pub fn compare_heatmaps(
        &self,
        metadata: &str,
        baseline_at: i64,
        before: ScreenCutoff,
        after: ScreenCutoff,
    ) -> Result<HeatmapComparison<'a>, String> {
        let reports = parse(self.universe, metadata)?;
        Ok(HeatmapComparison {
            before: self.heatmap_at(&reports, baseline_at, before.effective_at, before.known_at)?,
            after: self.heatmap_at(&reports, baseline_at, after.effective_at, after.known_at)?,
        })
    }

    fn heatmap_at(
        &self,
        reports: &Classifications,
        baseline_at: i64,
        effective_at: i64,
        known_at: i64,
    ) -> Result<Heatmap<'a>, String> {
        let listings: Vec<_> = self
            .screen(baseline_at, effective_at, known_at)?
            .into_iter()
            .map(|ranking| {
                let classification = reports
                    .get(&ranking.listing.listing_id)
                    .and_then(|history| {
                        history
                            .range(..=effective_at)
                            .rev()
                            .find_map(|(_, revisions)| {
                                let visible = revisions
                                    .partition_point(|revision| revision.observed_at <= known_at);
                                visible.checked_sub(1).map(|index| &revisions[index])
                            })
                    });
                (ranking, classification)
            })
            .collect();
        let known_weight = listings
            .iter()
            .filter_map(|(_, report)| report.and_then(|value| value.weight))
            .sum::<i64>();
        let mut by_sector = BTreeMap::<Option<&str>, SectorGroup>::new();
        let mut sums = BTreeMap::<Option<&str>, i128>::new();
        for (ranking, classification) in listings {
            let sector = classification.and_then(|report| report.sector.as_deref());
            let weight = classification.and_then(|report| report.weight);
            let weighted = weight
                .zip(ranking.ratio())
                .map(|(weight, (current, baseline))| {
                    i128::from(weight) * rounded_div((current - baseline) * RETURN_SCALE, baseline)
                });
            let group = by_sector.entry(sector).or_insert_with(|| SectorGroup {
                sector: sector.map(str::to_owned),
                listings: Vec::new(),
                known_weight: 0,
                covered_weight: 0,
                weighted_return: None,
                contribution: None,
            });
            group.known_weight += weight.unwrap_or_default();
            if let Some(value) = weighted {
                group.covered_weight += weight.unwrap_or_default();
                *sums.entry(sector).or_default() += value;
            }
            group.listings.push(HeatmapListing {
                ranking,
                classification: classification.cloned(),
                contribution: weighted.and_then(|value| display(value, known_weight)),
            });
        }
        let numerator = sums.values().copied().sum();
        let contribution = (!sums.is_empty())
            .then(|| display(numerator, known_weight))
            .flatten();
        let mut groups: Vec<_> = by_sector.into_values().collect();
        for group in &mut groups {
            if let Some(weighted) = sums.get(&group.sector.as_deref()).copied() {
                group.weighted_return = display(weighted, group.covered_weight);
                group.contribution = display(weighted, known_weight);
            }
        }
        groups.sort_unstable_by(|a, b| {
            b.known_weight
                .cmp(&a.known_weight)
                .then_with(|| a.sector.is_none().cmp(&b.sector.is_none()))
                .then_with(|| a.sector.cmp(&b.sector))
        });
        Ok(Heatmap {
            known_weight,
            covered_weight: groups.iter().map(|group| group.covered_weight).sum(),
            groups,
            contribution,
        })
    }
}

fn display(weighted: i128, weight: i64) -> Option<i128> {
    (weight > 0).then(|| rounded_div(weighted, i128::from(weight) * DISPLAY_DIVISOR))
}
