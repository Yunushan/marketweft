use marketweft_core::{evaluate_scalar_plugin, MAX_SCALAR_PLUGIN_BYTES};

fn plugin(name: &str) -> Vec<u8> {
    let (_, hex) = include_str!("fixtures/scalar-plugins.txt")
        .lines()
        .filter_map(|line| line.split_once(' '))
        .find(|(id, _)| *id == name)
        .unwrap();
    (0..hex.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&hex[index..index + 2], 16).unwrap())
        .collect()
}

#[test]
fn scalar_plugins_are_exact_and_have_fresh_instance_state() {
    let increment = plugin("increment");
    assert_eq!(
        evaluate_scalar_plugin(&increment, -123_456_789),
        Ok(-123_456_788)
    );
    assert_eq!(
        evaluate_scalar_plugin(&increment, i64::MIN),
        Ok(i64::MIN + 1)
    );
    let state = plugin("state");
    assert_eq!(evaluate_scalar_plugin(&state, 80), Ok(1));
    assert_eq!(evaluate_scalar_plugin(&state, 80), Ok(1));
}

#[test]
fn scalar_plugins_reject_ambient_capabilities_and_use_bounded_resources() {
    for (name, expected) in [
        ("import", "cannot import"),
        ("float", "unsupported WebAssembly instructions"),
        ("signature", "signature (i64) -> i64"),
        ("start", "Invalid scalar plugin"),
        ("memory", "resource limits"),
        ("memory_grow", "WebAssembly trap"),
        ("fuel", "exhausted its execution budget"),
        ("trap", "WebAssembly trap"),
    ] {
        let error = evaluate_scalar_plugin(&plugin(name), 0).unwrap_err();
        assert!(error.contains(expected), "{name}: {error}");
    }
    assert!(
        evaluate_scalar_plugin(&vec![0; MAX_SCALAR_PLUGIN_BYTES + 1], 0)
            .unwrap_err()
            .contains("64 KiB")
    );
    assert!(evaluate_scalar_plugin(b"invalid", 0)
        .unwrap_err()
        .contains("Invalid scalar plugin"));
    assert_eq!(evaluate_scalar_plugin(&plugin("increment"), 0), Ok(1));
}
