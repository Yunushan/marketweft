use crate::{indicator, screen::rounded_div, Average, Bar, MAX_BARS, MAX_TICKS, SCALE};
use std::collections::VecDeque;
use std::sync::Arc;

#[path = "formula_parse.rs"]
mod parse;

pub const FORMULA_VERSION: u32 = 1;
pub(crate) const MAX_SOURCE_BYTES: usize = 2_048;
pub(crate) const MAX_FORMULA_LIBRARY_BYTES: usize = 40 * 1024;
const MAX_NODES: usize = 96;
const MAX_DEPTH: usize = 32;
const MAX_PERIOD: usize = 4_096;
const MAX_EVALUATIONS: usize = 4_000_000;
const MAX_FUNCTIONS: usize = 16;
const MAX_PARAMETERS: usize = 4;
const MAX_EXPANDED_NODES: usize = 512;
type Value = Option<i64>;

pub struct Formula {
    nodes: Vec<Node>,
    functions: Arc<[CompiledFunction]>,
    work: usize,
}

pub struct FormulaFunctionDefinition<'a> {
    pub name: &'a str,
    pub parameters: &'a [&'a str],
    pub body: &'a str,
}

pub struct FormulaLibrary {
    functions: Arc<[CompiledFunction]>,
}

struct CompiledFunction {
    name: String,
    arity: usize,
    nodes: Vec<Node>,
    work: usize,
}

impl FormulaLibrary {
    /// Build a caller-owned library of pure functions. A body can call functions
    /// earlier in this slice and receives data only through its declared arguments.
    pub fn new(definitions: &[FormulaFunctionDefinition<'_>]) -> Result<Self, String> {
        if definitions.is_empty() || definitions.len() > MAX_FUNCTIONS {
            return Err("Supply 1–16 custom formula functions.".into());
        }
        let mut functions: Vec<CompiledFunction> = Vec::with_capacity(definitions.len());
        for definition in definitions {
            let name = definition.name;
            if !parse::custom_identifier(name) {
                return Err("Use an ASCII formula function name of up to 32 characters that is distinct from the built-ins.".into());
            }
            if functions.iter().any(|item| item.name == name) {
                return Err(format!("Repeated formula function name {name}."));
            }
            let parameters = definition.parameters;
            if !(1..=MAX_PARAMETERS).contains(&parameters.len())
                || parameters.iter().enumerate().any(|(index, parameter)| {
                    !parse::custom_identifier(parameter) || parameters[..index].contains(parameter)
                })
            {
                return Err(format!(
                    "Function {name} needs 1–4 distinct parameter names."
                ));
            }
            let (nodes, work) = parse::compile(definition.body, Some(parameters), &functions)
                .map_err(|cause| format!("Function {name}: {cause}"))?;
            functions.push(CompiledFunction {
                name: name.to_owned(),
                arity: parameters.len(),
                nodes,
                work,
            });
        }
        Ok(Self {
            functions: functions.into(),
        })
    }

    pub fn compile(&self, source: &str) -> Result<Formula, String> {
        let (nodes, work) = parse::compile(source, None, &self.functions)?;
        Ok(Formula {
            nodes,
            functions: Arc::clone(&self.functions),
            work,
        })
    }
}

pub(crate) fn decode_formula_library(mut remaining: &str) -> Result<FormulaLibrary, String> {
    if remaining.len() > MAX_FORMULA_LIBRARY_BYTES {
        return Err("Invalid formula function library length.".into());
    }
    let mut definitions = Vec::new();
    while !remaining.is_empty() {
        if definitions.len() == MAX_FUNCTIONS {
            return Err("Supply at most 16 custom formula functions.".into());
        }
        let (header, body) = remaining
            .split_once('\n')
            .ok_or("Supply formula function settings.")?;
        let (name, signature) = header
            .split_once('\t')
            .ok_or("Supply a function name and signature.")?;
        let (parameters, length) = signature
            .split_once('\t')
            .ok_or("Supply the parameters and function body length.")?;
        let (body, rest) = length
            .parse::<usize>()
            .ok()
            .and_then(|size| body.split_at_checked(size))
            .ok_or("Invalid formula function body length.")?;
        let parameters: Vec<_> = parameters.splitn(MAX_PARAMETERS + 1, ',').collect();
        definitions.push((name, parameters, body));
        remaining = rest;
    }
    let definitions: Vec<_> = definitions
        .iter()
        .map(|(name, parameters, body)| FormulaFunctionDefinition {
            name,
            parameters,
            body,
        })
        .collect();
    FormulaLibrary::new(&definitions)
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
    Parameter(usize),
    Unary(Unary, usize),
    Binary(Binary, usize, usize),
    Select(usize, usize, usize),
    Window(Window, usize, usize),
    Custom(usize, [usize; MAX_PARAMETERS]),
}

impl Formula {
    pub fn compile(source: &str) -> Result<Self, String> {
        let (nodes, work) = parse::compile(source, None, &[])?;
        Ok(Self {
            nodes,
            functions: Arc::from([]),
            work,
        })
    }

    pub(crate) fn node_count(&self) -> usize {
        self.work
    }

    /// Evaluate one value per observed bar. Missing values retain their positions.
    pub fn evaluate(&self, bars: &[Bar]) -> Result<Vec<Option<i64>>, String> {
        if bars.len() > MAX_BARS || bars.len() > MAX_EVALUATIONS / self.work {
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
        evaluate(&self.nodes, bars, &[], &self.functions)
    }
}

fn evaluate(
    nodes: &[Node],
    bars: &[Bar],
    parameters: &[Vec<Value>],
    functions: &[CompiledFunction],
) -> Result<Vec<Value>, String> {
    let mut results: Vec<Option<Vec<Value>>> = Vec::with_capacity(nodes.len());
    for &node in nodes {
        let mut take = |index: usize| -> Vec<Value> {
            results[index]
                .take()
                .expect("each formula operand has one parent")
        };
        let values = match node {
            Node::Literal(value) => vec![Some(value); bars.len()],
            Node::Field(field) => bars.iter().map(|bar| Some(field.value(bar))).collect(),
            Node::Parameter(index) => parameters[index].clone(),
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
                        condition.and_then(|value| if value == 0 { when_false } else { when_true });
                }
                values
            }
            Node::Window(window, child, period) => apply_window(window, take(child), period)?,
            Node::Custom(index, arguments) => {
                let function = &functions[index];
                let inputs: Vec<_> = arguments[..function.arity]
                    .iter()
                    .map(|&id| take(id))
                    .collect();
                evaluate(&function.nodes, bars, &inputs, &functions[..index])?
            }
        };
        results.push(Some(values));
    }
    Ok(results
        .pop()
        .flatten()
        .expect("a compiled formula has an output"))
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
