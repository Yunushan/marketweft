use marketweft_core::{
    evaluate_scalar_plugin, evaluate_scalar_plugin_series, Bar, ScalarPluginPoint,
    MAX_SCALAR_PLUGIN_BYTES, MAX_SCALAR_PLUGIN_SERIES_BARS,
};

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

fn bar(time: i64, close: i64) -> Bar {
    Bar {
        time,
        open: close,
        high: close,
        low: close,
        close,
        volume: 1,
    }
}

#[test]
fn scalar_series_selects_equal_cutoffs_and_does_not_reuse_instance_state() {
    let input = [bar(60, -5), bar(180, 3), bar(240, -1)];
    let increment = plugin("increment");
    let first = ScalarPluginPoint {
        time: 60,
        close: -5,
        value: -4,
    };
    let middle = ScalarPluginPoint {
        time: 180,
        close: 3,
        value: 4,
    };
    let last = ScalarPluginPoint {
        time: 240,
        close: -1,
        value: 0,
    };
    assert_eq!(
        evaluate_scalar_plugin_series(&increment, &input, 0, 59),
        Ok(vec![])
    );
    assert_eq!(
        evaluate_scalar_plugin_series(&increment, &input, 0, 60),
        Ok(vec![first])
    );
    assert_eq!(
        evaluate_scalar_plugin_series(&increment, &input, 60, 239),
        Ok(vec![first, middle])
    );
    assert_eq!(
        evaluate_scalar_plugin_series(&increment, &input, 180, 240),
        Ok(vec![middle, last])
    );
    assert_eq!(
        evaluate_scalar_plugin_series(&plugin("state"), &input, 60, 240)
            .unwrap()
            .iter()
            .map(|row| row.value)
            .collect::<Vec<_>>(),
        [1, 1, 1],
    );
    assert!(evaluate_scalar_plugin_series(&increment, &input, 180, 60).is_err());
}

#[test]
fn scalar_series_bounds_the_selected_rows_and_combined_fuel() {
    let input = (0..=MAX_SCALAR_PLUGIN_SERIES_BARS)
        .map(|index| bar(index as i64, 5))
        .collect::<Vec<_>>();
    let counted = plugin("counted");
    assert_eq!(evaluate_scalar_plugin(&counted, 5), Ok(5));
    assert_eq!(
        evaluate_scalar_plugin_series(&counted, &input, 10, 10).unwrap()[0].value,
        5
    );
    assert!(evaluate_scalar_plugin_series(&counted, &input, 0, 256)
        .unwrap_err()
        .contains("256 observed closes"));
    assert!(evaluate_scalar_plugin_series(&counted, &input, 0, 255)
        .unwrap_err()
        .contains("execution budget"));
    assert_eq!(
        evaluate_scalar_plugin_series(&counted, &input, 10, 10).unwrap()[0].value,
        5
    );
}
