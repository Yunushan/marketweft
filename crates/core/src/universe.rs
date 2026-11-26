use crate::{history::exact_utc, Instrument};
use std::collections::{BTreeMap, BTreeSet};

const MAX_ROWS: usize = 5_000;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
#[repr(u8)]
pub enum UniverseAction {
    Add = 0,
    Remove = 1,
    Delist = 2,
    Cancel = 3,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UniverseChange {
    pub change_id: String,
    pub listing_id: String,
    pub instrument: Instrument,
    pub effective_at: i64,
    pub observed_at: i64,
    pub action: UniverseAction,
}

#[derive(Clone, Debug)]
pub struct UniverseBook {
    name: String,
    rows: Vec<UniverseChange>,
}

impl UniverseBook {
    pub fn new(name: String, mut rows: Vec<UniverseChange>) -> Result<Self, String> {
        if !valid_id(&name) || rows.is_empty() || rows.len() > MAX_ROWS {
            return Err("Supply a valid universe ID and 1–5,000 membership reports.".into());
        }
        let mut instruments = BTreeMap::new();
        for row in &rows {
            if !valid_id(&row.change_id) || !valid_id(&row.listing_id) {
                return Err("Change and listing IDs must contain 1–40 ASCII letters, digits, dots, underscores or hyphens.".into());
            }
            if Instrument::new(&row.instrument.venue, &row.instrument.symbol)? != row.instrument {
                return Err("Use canonical VENUE:SYMBOL instrument labels.".into());
            }
            if let Some(previous) = instruments.insert(&row.listing_id, &row.instrument) {
                if previous != &row.instrument {
                    return Err(format!(
                        "Listing {} has conflicting instruments.",
                        row.listing_id
                    ));
                }
            }
        }
        rows.sort_unstable_by(|a, b| {
            (&a.change_id, a.observed_at).cmp(&(&b.change_id, b.observed_at))
        });
        for pair in rows
            .windows(2)
            .filter(|pair| pair[0].change_id == pair[1].change_id)
        {
            if pair[0].listing_id != pair[1].listing_id {
                return Err(format!(
                    "Change {} must keep its original listing ID.",
                    pair[0].change_id
                ));
            }
            if pair[0].observed_at == pair[1].observed_at {
                return Err(format!(
                    "Change {} has duplicate observation times.",
                    pair[0].change_id
                ));
            }
        }
        Ok(Self { name, rows })
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub(crate) fn listing_ids(&self) -> BTreeSet<&str> {
        self.rows
            .iter()
            .map(|row| row.listing_id.as_str())
            .collect()
    }

    pub(crate) fn for_listing(&self, listing_id: &str) -> Option<Self> {
        let rows: Vec<_> = self
            .rows
            .iter()
            .filter(|row| row.listing_id == listing_id)
            .cloned()
            .collect();
        (!rows.is_empty()).then(|| Self {
            name: self.name.clone(),
            rows,
        })
    }

    pub(crate) fn delisting_ids(&self) -> BTreeSet<(&str, &str)> {
        self.rows
            .iter()
            .filter(|row| row.action == UniverseAction::Delist)
            .map(|row| (row.listing_id.as_str(), row.change_id.as_str()))
            .collect()
    }

    pub(crate) fn report_count(&self) -> usize {
        self.rows.len()
    }

    /// Distinct points where a report becomes known or its known schedule becomes effective.
    pub fn checkpoints(&self) -> Vec<i64> {
        let mut checkpoints = BTreeSet::new();
        for revisions in self.rows.chunk_by(|a, b| a.change_id == b.change_id) {
            for (i, row) in revisions.iter().enumerate() {
                checkpoints.insert(row.observed_at);
                if row.action != UniverseAction::Cancel
                    && row.effective_at > row.observed_at
                    && revisions
                        .get(i + 1)
                        .is_none_or(|next| row.effective_at < next.observed_at)
                {
                    checkpoints.insert(row.effective_at);
                }
            }
        }
        checkpoints.into_iter().collect()
    }

    pub(crate) fn visible_changes(&self, effective_at: i64, known_at: i64) -> Vec<&UniverseChange> {
        let mut applicable: Vec<_> = self
            .rows
            .chunk_by(|a, b| a.change_id == b.change_id)
            .filter_map(|revisions| {
                let visible = revisions.partition_point(|row| row.observed_at <= known_at);
                visible.checked_sub(1).map(|i| &revisions[i])
            })
            .filter(|row| row.action != UniverseAction::Cancel && row.effective_at <= effective_at)
            .collect();
        // For coincident changes, delist supersedes remove, which supersedes add.
        applicable.sort_unstable_by(|a, b| {
            (a.effective_at, a.action, &a.change_id).cmp(&(b.effective_at, b.action, &b.change_id))
        });
        applicable
    }

    /// Reconstruct the listing states effective by one cutoff from reports known by the other.
    /// Add rows are members. Remove and Delist rows retain the state-changing evidence.
    pub fn as_of(&self, effective_at: i64, known_at: i64) -> Vec<&UniverseChange> {
        let mut states = BTreeMap::<&str, &UniverseChange>::new();
        for row in self.visible_changes(effective_at, known_at) {
            let state = states.entry(&row.listing_id).or_insert(row);
            if state.action != UniverseAction::Delist {
                *state = row;
            }
        }
        states.into_values().collect()
    }
}

pub(crate) fn valid_id(value: &str) -> bool {
    (1..=40).contains(&value.len())
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
}

pub fn parse_universe(csv: &str) -> Result<UniverseBook, String> {
    if csv.len() > 1024 * 1024 {
        return Err("Universe membership CSV exceeds 1 MiB.".into());
    }
    let mut lines = csv
        .trim_start_matches('\u{feff}')
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty());
    if lines.next().map(|(_, row)| row.trim())
        != Some("universe,change_id,listing_id,instrument,effective_at,observed_at,action")
    {
        return Err("Expected universe header universe,change_id,listing_id,instrument,effective_at,observed_at,action.".into());
    }
    let mut universe: Option<&str> = None;
    let mut rows = Vec::new();
    for (line, content) in lines {
        let error = |reason: &str| format!("Universe line {}: {reason}", line + 1);
        if rows.len() == MAX_ROWS {
            return Err(error("Supply at most 5,000 membership reports."));
        }
        let mut fields = content.split(',').map(str::trim);
        let name = fields.next().filter(|value| valid_id(value))
            .ok_or_else(|| error("Use a universe ID of 1–40 ASCII letters, digits, dots, underscores or hyphens."))?;
        if *universe.get_or_insert(name) != name {
            return Err(error("All rows must belong to the same universe."));
        }
        let mut id = || {
            fields
                .next()
                .filter(|value| valid_id(value))
                .map(str::to_owned)
                .ok_or_else(|| error("Use valid change and listing IDs."))
        };
        let change_id = id()?;
        let listing_id = id()?;
        let label = fields.next().unwrap_or_default();
        let (venue, symbol) = label
            .split_once(':')
            .ok_or_else(|| error("Use canonical VENUE:SYMBOL."))?;
        let instrument = Instrument::new(venue, symbol).map_err(|reason| error(&reason))?;
        if instrument.to_string() != label {
            return Err(error("Use canonical VENUE:SYMBOL."));
        }
        let mut time = || {
            fields
                .next()
                .and_then(exact_utc)
                .ok_or_else(|| error("Use exact UTC timestamps in YYYY-MM-DDTHH:MM:SSZ format."))
        };
        let effective_at = time()?;
        let observed_at = time()?;
        let action = match fields.next() {
            Some("add") => UniverseAction::Add,
            Some("remove") => UniverseAction::Remove,
            Some("delist") => UniverseAction::Delist,
            Some("cancel") => UniverseAction::Cancel,
            _ => return Err(error("Action must be add, remove, delist or cancel.")),
        };
        if fields.next().is_some() {
            return Err(error("Expected exactly seven fields."));
        }
        rows.push(UniverseChange {
            change_id,
            listing_id,
            instrument,
            effective_at,
            observed_at,
            action,
        });
    }
    UniverseBook::new(universe.unwrap_or_default().to_owned(), rows)
}
