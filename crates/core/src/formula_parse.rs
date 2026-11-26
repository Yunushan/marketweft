use super::{
    Binary, CompiledFunction, Field, Node, Unary, Window, MAX_DEPTH, MAX_EXPANDED_NODES, MAX_NODES,
    MAX_PARAMETERS, MAX_PERIOD, MAX_SOURCE_BYTES,
};
use crate::{history::decimal, Average};

pub(super) fn compile(
    source: &str,
    parameters: Option<&[&str]>,
    functions: &[CompiledFunction],
) -> Result<(Vec<Node>, usize), String> {
    if source.len() > MAX_SOURCE_BYTES {
        return Err("Formula exceeds 2,048 source bytes.".into());
    }
    if !source.is_ascii() {
        return Err("Formulas use ASCII identifiers, numbers and operators.".into());
    }
    let mut parser = Parser {
        source,
        next: 0,
        nodes: Vec::new(),
        parameters,
        functions,
        work: 0,
    };
    parser.expression(0, 1)?;
    if parser.rest().is_empty() {
        Ok((parser.nodes, parser.work))
    } else {
        Err(parser.error("Unexpected input."))
    }
}

const FUNCTIONS: &[&str] = &[
    "abs", "coalesce", "if", "lag", "sma", "ema", "lowest", "highest",
];

fn field(name: &str) -> Option<Field> {
    match name {
        "open" => Some(Field::Open),
        "high" => Some(Field::High),
        "low" => Some(Field::Low),
        "close" => Some(Field::Close),
        "volume" => Some(Field::Volume),
        _ => None,
    }
}

pub(super) fn custom_identifier(name: &str) -> bool {
    let bytes = name.as_bytes();
    bytes.len() <= 32
        && bytes
            .first()
            .is_some_and(|byte| byte.is_ascii_alphabetic() || *byte == b'_')
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'_')
        && field(name).is_none()
        && !FUNCTIONS.contains(&name)
}

struct Parser<'a, 'scope> {
    source: &'a str,
    next: usize,
    nodes: Vec<Node>,
    parameters: Option<&'scope [&'scope str]>,
    functions: &'scope [CompiledFunction],
    work: usize,
}

impl<'a> Parser<'a, '_> {
    fn error(&self, message: &str) -> String {
        format!("Formula byte {}: {message}", self.next + 1)
    }

    fn rest(&mut self) -> &'a str {
        let rest = self.source[self.next..].trim_ascii_start();
        self.next = self.source.len() - rest.len();
        rest
    }

    fn expression(&mut self, precedence: u8, depth: usize) -> Result<usize, String> {
        let mut left = self.prefix(depth)?;
        while let Some((symbol, operation, priority)) = self.operator() {
            if priority < precedence {
                break;
            }
            self.next += symbol.len();
            let right = self.expression(priority + 1, depth + 1)?;
            left = self.add(Node::Binary(operation, left, right))?;
        }
        Ok(left)
    }

    fn prefix(&mut self, depth: usize) -> Result<usize, String> {
        if depth > MAX_DEPTH {
            return Err(self.error("Use at most 32 nested expression levels."));
        }
        let rest = self.rest();
        match rest.as_bytes().first().copied() {
            Some(b'-') => {
                self.next += 1;
                let child = self.prefix(depth + 1)?;
                self.add(Node::Unary(Unary::Negate, child))
            }
            Some(b'+') => {
                self.next += 1;
                self.prefix(depth + 1)
            }
            Some(b'(') => {
                self.next += 1;
                let child = self.expression(0, depth + 1)?;
                self.expect(")")?;
                Ok(child)
            }
            Some(b'0'..=b'9') => {
                let length = rest
                    .bytes()
                    .take_while(|byte| byte.is_ascii_digit() || *byte == b'.')
                    .count();
                let value = decimal(&rest[..length]).ok_or_else(|| {
                    self.error("Use a supported decimal with at most six fractional places.")
                })?;
                self.next += length;
                self.add(Node::Literal(value))
            }
            Some(b'a'..=b'z' | b'A'..=b'Z' | b'_') => {
                let length = rest
                    .bytes()
                    .take_while(|byte| byte.is_ascii_alphanumeric() || *byte == b'_')
                    .count();
                let name = &rest[..length];
                self.next += length;
                if let Some(field) = field(name) {
                    if self.parameters.is_some() {
                        return Err(self.error("Pass market fields through an explicit parameter."));
                    }
                    self.add(Node::Field(field))
                } else if let Some(index) = self.parameters.and_then(|parameters| {
                    parameters.iter().position(|parameter| *parameter == name)
                }) {
                    self.add(Node::Parameter(index))
                } else {
                    self.call(name, depth + 1)
                }
            }
            _ => Err(self.error("Expected a number, field, function or parenthesized expression.")),
        }
    }

    fn call(&mut self, name: &str, depth: usize) -> Result<usize, String> {
        let window = match name {
            "lag" => Some(Window::Lag),
            "sma" => Some(Window::Mean(Average::Simple)),
            "ema" => Some(Window::Mean(Average::Exponential)),
            "lowest" => Some(Window::Lowest),
            "highest" => Some(Window::Highest),
            "abs" | "coalesce" | "if" => None,
            _ => return self.custom_call(name, depth),
        };
        self.expect("(")?;
        let first = self.expression(0, depth)?;
        let node = if let Some(window) = window {
            self.expect(",")?;
            let rest = self.rest();
            let width = rest.bytes().take_while(u8::is_ascii_digit).count();
            let period = rest[..width]
                .parse::<usize>()
                .ok()
                .filter(|period| (1..=MAX_PERIOD).contains(period))
                .ok_or_else(|| self.error("Use a literal window or lag of 1–4,096 bars."))?;
            self.next += width;
            Node::Window(window, first, period)
        } else if name == "abs" {
            Node::Unary(Unary::Absolute, first)
        } else {
            self.expect(",")?;
            let second = self.expression(0, depth)?;
            if name == "coalesce" {
                Node::Binary(Binary::Coalesce, first, second)
            } else {
                self.expect(",")?;
                Node::Select(first, second, self.expression(0, depth)?)
            }
        };
        self.expect(")")?;
        self.add(node)
    }

    fn custom_call(&mut self, name: &str, depth: usize) -> Result<usize, String> {
        let (index, function) = self
            .functions
            .iter()
            .enumerate()
            .find(|(_, function)| function.name == name)
            .ok_or_else(|| self.error("Unknown formula field or function."))?;
        let mut arguments = [0; MAX_PARAMETERS];
        self.expect("(")?;
        for (position, argument) in arguments[..function.arity].iter_mut().enumerate() {
            if position > 0 {
                self.expect(",")?;
            }
            *argument = self.expression(0, depth)?;
        }
        self.expect(")")?;
        self.add(Node::Custom(index, arguments))
    }

    fn expect(&mut self, token: &str) -> Result<(), String> {
        if self.rest().starts_with(token) {
            self.next += token.len();
            Ok(())
        } else {
            Err(self.error(&format!("Expected {token}.")))
        }
    }

    fn add(&mut self, node: Node) -> Result<usize, String> {
        if self.nodes.len() == MAX_NODES {
            return Err(self.error("Use at most 96 expression nodes."));
        }
        self.work += 1;
        if let Node::Custom(index, _) = node {
            self.work += self.functions[index].work;
        }
        if self.work > MAX_EXPANDED_NODES {
            return Err(self.error("Custom function calls exceed 512 total expression nodes."));
        }
        self.nodes.push(node);
        Ok(self.nodes.len() - 1)
    }

    fn operator(&mut self) -> Option<(&'static str, Binary, u8)> {
        let rest = self.rest();
        [
            ("==", Binary::Equal, 1),
            ("!=", Binary::NotEqual, 1),
            ("<=", Binary::LessEqual, 1),
            (">=", Binary::GreaterEqual, 1),
            ("<", Binary::Less, 1),
            (">", Binary::Greater, 1),
            ("+", Binary::Add, 2),
            ("-", Binary::Subtract, 2),
            ("*", Binary::Multiply, 3),
            ("/", Binary::Divide, 3),
        ]
        .into_iter()
        .find(|(symbol, _, _)| rest.starts_with(symbol))
    }
}
