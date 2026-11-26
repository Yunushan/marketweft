use crate::{indicator, screen::rounded_div, Average, Bar, MAX_BARS, MAX_TICKS, SCALE};
use std::collections::VecDeque;

#[path = "formula_parse.rs"]
mod parse;

pub const FORMULA_VERSION: u32 = 1;
const MAX_SOURCE_BYTES: usize = 2_048;
const MAX_NODES: usize = 96;
const MAX_DEPTH: usize = 32;
const MAX_PERIOD: usize = 4_096;
const MAX_EVALUATIONS: usize = 4_000_000;
type Value = Option<i64>;

pub struct Formula {
    nodes: Vec<Node>,
}

#[derive(Clone, Copy)]
enum Field {
    Open,
    High,
    Low,
    Close,
    Volume,
}

impl Field {
    fn value(self, bar: &Bar) -> i64 {
        match self {
            Self::Open => bar.open,
            Self::High => bar.high,
            Self::Low => bar.low,
            Self::Close => bar.close,
            Self::Volume => bar.volume,
        }
    }
}

#[derive(Clone, Copy)]
enum Binary {
    Add,
    Subtract,
    Multiply,
    Divide,
    Equal,
    NotEqual,
    Less,
    LessEqual,
    Greater,
    GreaterEqual,
    Coalesce,
}

#[derive(Clone, Copy)]
enum Unary {
    Negate,
    Absolute,
}

#[derive(Clone, Copy)]
enum Window {
    Lag,
    Mean(Average),
    Lowest,
    Highest,
}

#[derive(Clone, Copy)]
enum Node {
    Literal(i64),
    Field(Field),
    Unary(Unary, usize),
    Binary(Binary, usize, usize),
    Select(usize, usize, usize),
    Window(Window, usize, usize),
}

impl Formula {
    pub fn compile(source: &str) -> Result<Self, String> {
        parse::compile(source)
    }

    /// Evaluate one value per observed bar. Missing values retain their positions.
    pub fn evaluate(&self, bars: &[Bar]) -> Result<Vec<Option<i64>>, String> {
        if bars.len() > MAX_BARS || bars.len() > MAX_EVALUATIONS / self.nodes.len() {
            return Err(
                "Formula exceeds the four million expression-row limit or the 100,000 bar limit."
                    .into(),
            );
        }
        if bars.windows(2).any(|pair| pair[0].time >= pair[1].time)
            || bars.iter().any(|row| {
                [row.open, row.high, row.low, row.close]
                    .into_iter()
                    .any(|price| !(-MAX_TICKS..=MAX_TICKS).contains(&price))
                    || !(0..=MAX_TICKS).contains(&row.volume)
            })
        {
            return Err("Use ordered bars with supported prices and nonnegative volume.".into());
        }

        let mut results: Vec<Option<Vec<Value>>> = Vec::with_capacity(self.nodes.len());
        for &node in &self.nodes {
            let mut take = |index: usize| -> Vec<Value> {
                results[index]
                    .take()
                    .expect("each formula operand has one parent")
            };
            let values = match node {
                Node::Literal(value) => vec![Some(value); bars.len()],
                Node::Field(field) => bars.iter().map(|bar| Some(field.value(bar))).collect(),
                Node::Unary(operation, child) => {
                    let mut values = take(child);
                    for value in values.iter_mut().flatten() {
                        *value = match operation {
                            Unary::Negate => -*value,
                            Unary::Absolute => value.abs(),
                        };
                    }
                    values
                }
                Node::Binary(operation, left, right) => {
                    let mut left = take(left);
                    for (value, right) in left.iter_mut().zip(take(right)) {
                        *value = binary(operation, *value, right);
                    }
                    left
                }
                Node::Select(condition, when_true, when_false) => {
                    let mut values = take(condition);
                    for ((condition, when_true), when_false) in
                        values.iter_mut().zip(take(when_true)).zip(take(when_false))
                    {
                        *condition =
                            condition
                                .and_then(|value| if value == 0 { when_false } else { when_true });
                    }
                    values
                }
                Node::Window(window, child, period) => apply_window(window, take(child), period)?,
            };
            results.push(Some(values));
        }
        Ok(results
            .pop()
            .flatten()
            .expect("a compiled formula has an output"))
    }
}

fn binary(operation: Binary, left: Value, right: Value) -> Value {
    if matches!(operation, Binary::Coalesce) {
        return left.or(right);
    }
    let left = i128::from(left?);
    let right = i128::from(right?);
    let scale = i128::from(SCALE);
    let ticks = match operation {
        Binary::Add => left + right,
        Binary::Subtract => left - right,
        Binary::Multiply => rounded_div(left * right, scale),
        Binary::Divide if right != 0 => rounded_div(left * scale * right.signum(), right.abs()),
        Binary::Divide => return None,
        Binary::Equal => i128::from(left == right) * scale,
        Binary::NotEqual => i128::from(left != right) * scale,
        Binary::Less => i128::from(left < right) * scale,
        Binary::LessEqual => i128::from(left <= right) * scale,
        Binary::Greater => i128::from(left > right) * scale,
        Binary::GreaterEqual => i128::from(left >= right) * scale,
        Binary::Coalesce => unreachable!(),
    };
    (ticks.abs() <= i128::from(MAX_TICKS)).then_some(ticks as i64)
}

fn apply_window(
    window: Window,
    mut values: Vec<Value>,
    period: usize,
) -> Result<Vec<Value>, String> {
    match window {
        Window::Lag => {
            let shift = period.min(values.len());
            values.rotate_right(shift);
            values[..shift].fill(None);
            Ok(values)
        }
        Window::Mean(kind) => {
            let mut out = Vec::with_capacity(values.len());
            for run in values.chunk_by(|left, right| left.is_some() == right.is_some()) {
                if run[0].is_some() {
                    let dense: Vec<_> = run.iter().flatten().copied().collect();
                    out.extend(indicator(kind, period, &dense)?);
                } else {
                    out.resize(out.len() + run.len(), None);
                }
            }
            Ok(out)
        }
        Window::Lowest | Window::Highest => {
            let mut queue = VecDeque::<(usize, i64)>::new();
            let mut contiguous = 0;
            for (index, value) in values.iter_mut().enumerate() {
                let Some(current) = *value else {
                    queue.clear();
                    contiguous = 0;
                    continue;
                };
                contiguous += 1;
                while queue
                    .front()
                    .is_some_and(|(previous, _)| *previous + period <= index)
                {
                    queue.pop_front();
                }
                while queue.back().is_some_and(|(_, previous)| {
                    if matches!(window, Window::Lowest) {
                        *previous >= current
                    } else {
                        *previous <= current
                    }
                }) {
                    queue.pop_back();
                }
                queue.push_back((index, current));
                *value = (contiguous >= period).then(|| queue.front().unwrap().1);
            }
            Ok(values)
        }
    }
}
