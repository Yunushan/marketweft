use super::{
    Binary, Field, Formula, Node, Unary, Window, MAX_DEPTH, MAX_NODES, MAX_PERIOD, MAX_SOURCE_BYTES,
};
use crate::{history::decimal, Average};

pub(super) fn compile(source: &str) -> Result<Formula, String> {
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
    };
    parser.expression(0, 1)?;
    if parser.rest().is_empty() {
        Ok(Formula {
            nodes: parser.nodes,
        })
    } else {
        Err(parser.error("Unexpected input."))
    }
}

struct Parser<'a> {
    source: &'a str,
    next: usize,
    nodes: Vec<Node>,
}

impl<'a> Parser<'a> {
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
                let field = match name {
                    "open" => Some(Field::Open),
                    "high" => Some(Field::High),
                    "low" => Some(Field::Low),
                    "close" => Some(Field::Close),
                    "volume" => Some(Field::Volume),
                    _ => None,
                };
                self.next += length;
                if let Some(field) = field {
                    self.add(Node::Field(field))
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
            _ => return Err(self.error("Unknown formula field or function.")),
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
