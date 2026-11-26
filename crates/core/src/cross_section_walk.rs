use super::{CorporateReports, CrossSectionActionSources};
use crate::{
    CrossSectionConfig, CrossSectionReport, LiquidityTape, PaperAccount, PaperAction, PriceBook,
};
use std::collections::BTreeSet;

const MAX_CANDIDATES: usize = 16;
const MAX_FOLDS: usize = 64;
const MAX_EVALUATIONS: usize = 8_000_000;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct CrossSectionCandidate {
    pub top_listings: usize,
    pub lookback_seconds: u32,
}

impl CrossSectionCandidate {
    fn configure(self, base: CrossSectionConfig) -> CrossSectionConfig {
        CrossSectionConfig {
            top_listings: self.top_listings,
            lookback_seconds: self.lookback_seconds,
            ..base
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct CrossSectionWalkConfig<'a> {
    pub replay: CrossSectionConfig,
    pub training_decisions: usize,
    pub test_decisions: usize,
    pub candidates: &'a [CrossSectionCandidate],
    pub corporate: Option<CrossSectionActionSources<'a>>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CrossSectionScore {
    pub candidate: CrossSectionCandidate,
    pub equity: Option<i128>,
    pub cash: i128,
    pub turnover: i128,
    pub fees: i128,
    pub accepted_fills: usize,
    pub decisions: usize,
    pub ranked_observations: usize,
    pub missing_observations: usize,
}

impl CrossSectionScore {
    fn from_report(candidate: CrossSectionCandidate, report: CrossSectionReport) -> Self {
        Self {
            candidate,
            equity: report.equity,
            cash: report.cash,
            turnover: report.turnover,
            fees: report.fees,
            accepted_fills: report
                .events
                .iter()
                .filter(|row| {
                    matches!(row.event.action, PaperAction::Fill { .. })
                        && row.receipt.rejection.is_none()
                })
                .count(),
            decisions: report.decisions.len(),
            ranked_observations: report.decisions.iter().map(|row| row.eligible_count).sum(),
            missing_observations: report.decisions.iter().map(|row| row.missing_count).sum(),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CrossSectionFold {
    pub training_from: i64,
    pub training_through: i64,
    pub test_from: i64,
    pub test_through: i64,
    pub training_scores: Vec<CrossSectionScore>,
    pub test_score: Option<CrossSectionScore>,
}

impl PriceBook<'_> {
    /// Roll through complete disjoint test windows, freezing the training winner
    /// at the end of its preceding training window. Accounts start flat in each run.
    pub fn cross_section_walk_forward(
        &self,
        liquidity: &LiquidityTape,
        config: CrossSectionWalkConfig<'_>,
    ) -> Result<Vec<CrossSectionFold>, String> {
        let CrossSectionWalkConfig {
            replay,
            training_decisions,
            test_decisions,
            candidates,
            corporate,
        } = config;
        replay.decisions()?;
        PaperAccount::new(replay.paper).map_err(|_| "Invalid paper account settings.")?;
        if liquidity.universe_name() != self.universe.name() {
            return Err("Liquidity and price inputs must use the same universe.".into());
        }
        if !(2..=MAX_CANDIDATES).contains(&candidates.len())
            || candidates.iter().copied().collect::<BTreeSet<_>>().len() != candidates.len()
        {
            return Err("Supply 2–16 distinct ranking candidates.".into());
        }
        for &candidate in candidates {
            candidate.configure(replay).decisions()?;
        }
        if !(2..=512).contains(&training_decisions) || !(2..=512).contains(&test_decisions) {
            return Err("Use 2–512 decisions in each training and test window.".into());
        }
        let corporate = corporate
            .map(|sources| CorporateReports::parse(self, sources))
            .transpose()?;
        let first = replay.from_at;
        let last = replay.through_at.min(replay.known_at);
        let step = i64::from(replay.decision_seconds);
        let visible = if last < first {
            0
        } else {
            ((last - first) / step + 1) as usize
        };
        let Some(available) = visible.checked_sub(training_decisions + test_decisions) else {
            return Ok(Vec::new());
        };
        if available / test_decisions + 1 > MAX_FOLDS {
            return Err("Use at most 64 complete cross-sectional test windows.".into());
        }

        let window = |start, count| {
            let from = first + start as i64 * step;
            let through = from + (count as i64 - 1) * step;
            CrossSectionConfig {
                from_at: from,
                through_at: through,
                known_at: through,
                ..replay
            }
        };
        let mut folds = Vec::new();
        let mut evaluation_count = 0;
        for start in (0..=available).step_by(test_decisions) {
            let train = window(start, training_decisions);
            let test = window(start + training_decisions, test_decisions);
            let size = self.universe.report_count();
            let estimate = |query: CrossSectionConfig, decisions| -> Result<usize, String> {
                let quotes = liquidity.through(query.known_at);
                let quotes =
                    quotes.len() - quotes.partition_point(|row| row.observed_at < query.from_at);
                let actions = corporate
                    .as_ref()
                    .map(|reports| {
                        reports
                            .delistings
                            .paper_checkpoints(query.from_at, query.known_at)
                    })
                    .transpose()?
                    .map_or(0, |times| times.len());
                Ok(size * (decisions + quotes + actions))
            };
            evaluation_count += estimate(train, training_decisions)? * candidates.len()
                + estimate(test, test_decisions)?;
            if evaluation_count > MAX_EVALUATIONS {
                return Err("Cross-sectional optimization exceeds eight million membership evaluations. Use fewer windows, candidates or observations.".into());
            }
            let score = |candidate: CrossSectionCandidate, window| {
                self.run_cross_section(liquidity, candidate.configure(window), corporate.as_ref())
                    .map(|report| CrossSectionScore::from_report(candidate, report))
            };
            let mut scores = candidates
                .iter()
                .copied()
                .map(|candidate| score(candidate, train))
                .collect::<Result<Vec<_>, String>>()?;
            scores.sort_unstable_by(|left, right| {
                right
                    .equity
                    .cmp(&left.equity)
                    .then_with(|| left.candidate.cmp(&right.candidate))
            });
            let test_score = scores
                .first()
                .filter(|score| score.equity.is_some())
                .map(|winner| score(winner.candidate, test))
                .transpose()?;
            folds.push(CrossSectionFold {
                training_from: train.from_at,
                training_through: train.through_at,
                test_from: test.from_at,
                test_through: test.through_at,
                training_scores: scores,
                test_score,
            });
        }
        Ok(folds)
    }
}
