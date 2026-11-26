use marketweft_core::{Bar, Formula, FormulaFunctionDefinition, FormulaLibrary, SCALE};

fn definition<'a>(
    name: &'a str,
    parameters: &'a [&'a str],
    body: &'a str,
) -> FormulaFunctionDefinition<'a> {
    FormulaFunctionDefinition {
        name,
        parameters,
        body,
    }
}

fn bars() -> Vec<Bar> {
    (1..=4)
        .map(|index| Bar {
            time: index,
            open: index * SCALE,
            high: index * SCALE,
            low: SCALE,
            close: index * SCALE,
            volume: index * SCALE,
        })
        .collect()
}

#[test]
fn custom_functions_preserve_prefixes_and_explicit_missing_values() {
    let library = FormulaLibrary::new(&[
        definition("range", &["top", "bottom"], "top - bottom"),
        definition("strength", &["top", "bottom"], "sma(range(top, bottom), 2)"),
    ])
    .unwrap();
    let formula = library.compile("strength(close, lag(low, 1))").unwrap();
    let bars = bars();
    let expected = vec![None, None, Some(1_500_000), Some(2_500_000)];
    assert_eq!(formula.evaluate(&bars).unwrap(), expected);
    for length in 0..bars.len() {
        assert_eq!(
            formula.evaluate(&bars[..length]).unwrap(),
            expected[..length]
        );
    }
    assert!(Formula::compile("strength(close, low)").is_err());
    assert!(library.compile("range(close)").is_err());
    assert!(library.compile("range(close, low, high)").is_err());

    let alternative = FormulaLibrary::new(&[definition("range", &["x", "y"], "x * y")]).unwrap();
    assert_eq!(
        alternative
            .compile("range(close, 2)")
            .unwrap()
            .evaluate(&bars)
            .unwrap()
            .last(),
        Some(&Some(8_000_000))
    );
    assert_eq!(formula.evaluate(&bars).unwrap(), expected);
}

#[test]
fn custom_function_scope_excludes_ambient_bars_and_recursive_calls() {
    let cases = [
        ("ambient", "x + close", "explicit parameter"),
        ("recurse", "recurse(x)", "Unknown formula field or function"),
        ("forward", "other(x)", "Unknown formula field or function"),
        (
            "external",
            "read_file(x)",
            "Unknown formula field or function",
        ),
        ("lookahead", "lag(x, -1)", "literal window or lag"),
    ];
    for (name, body, diagnostic) in cases {
        assert!(
            matches!(FormulaLibrary::new(&[definition(name, &["x"], body)]),
            Err(message) if message.contains(diagnostic))
        );
    }
    assert!(FormulaLibrary::new(&[definition("sma", &["x"], "x")]).is_err());
    assert!(FormulaLibrary::new(&[definition("name", &["x", "x"], "x")]).is_err());
    assert!(FormulaLibrary::new(&[
        definition("name", &["x"], "x"),
        definition("name", &["x"], "x")
    ])
    .is_err());
}

#[test]
fn custom_functions_enforce_total_expansion_capacity() {
    let body = "x + ".repeat(36) + "x";
    let library = FormulaLibrary::new(&[
        definition("base", &["x"], &body),
        definition("branch", &["x"], "base(x) + base(x) + base(x)"),
    ])
    .unwrap();
    assert!(library.compile("branch(close) + branch(close)").is_ok());
    assert!(
        matches!(library.compile("branch(close) + branch(close) + branch(close)"),
        Err(message) if message.contains("512 total expression nodes"))
    );
}
