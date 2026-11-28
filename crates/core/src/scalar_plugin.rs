use crate::{
    history::{valid_second, validate_bar_time, validate_ohlcv},
    Bar, MAX_BARS,
};
use wasmi::{Config, EnforcedLimits, Engine, Linker, Module, Store, StoreLimitsBuilder, TrapCode};

pub const MAX_SCALAR_PLUGIN_BYTES: usize = 64 * 1024;
pub const MAX_SCALAR_PLUGIN_SERIES_BARS: usize = 256;
const FUEL_PER_CALL: u64 = 100_000;
const FUEL_PER_SERIES: u64 = 1_000_000;
const MEMORY_BYTES: usize = 2 * 1024 * 1024;
const ENTRY: &str = "marketweft_scalar_v1";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ScalarPluginPoint {
    pub time: i64,
    pub close: i64,
    pub value: i64,
}

/// Evaluate one signed-millionth value in a fresh integer-only WebAssembly instance.
pub fn evaluate_scalar_plugin(wasm: &[u8], input: i64) -> Result<i64, String> {
    invoke(&compile(wasm)?, input, FUEL_PER_CALL).map(|(result, _)| result)
}

/// Evaluate the observed closes in an inclusive UTC range with fresh state per close.
pub fn evaluate_scalar_plugin_series(
    wasm: &[u8],
    bars: &[Bar],
    from: i64,
    through: i64,
) -> Result<Vec<ScalarPluginPoint>, String> {
    if from > through || !valid_second(from) || !valid_second(through) {
        return Err("Use an ordered UTC range for scalar plugin closes.".into());
    }
    if bars.len() > MAX_BARS {
        return Err("Scalar plugin series support up to 100,000 source bars.".into());
    }
    let mut previous = None;
    for (index, bar) in bars.iter().enumerate() {
        validate_bar_time(bar.time, previous, index)?;
        previous = Some(bar.time);
    }
    let start = bars.partition_point(|bar| bar.time < from);
    let end = bars.partition_point(|bar| bar.time <= through);
    let selected = &bars[start..end];
    if selected.len() > MAX_SCALAR_PLUGIN_SERIES_BARS {
        return Err("Select a UTC range with up to 256 observed closes.".into());
    }
    let plugin = compile(wasm)?;
    let mut budget = FUEL_PER_SERIES;
    selected
        .iter()
        .enumerate()
        .map(|(index, bar)| {
            validate_ohlcv(bar, start + index)?;
            let (value, spent) = invoke(&plugin, bar.close, budget.min(FUEL_PER_CALL))?;
            budget -= spent;
            Ok(ScalarPluginPoint {
                time: bar.time,
                close: bar.close,
                value,
            })
        })
        .collect()
}

fn compile(wasm: &[u8]) -> Result<Module, String> {
    if wasm.len() > MAX_SCALAR_PLUGIN_BYTES {
        return Err("Scalar plugin exceeds 64 KiB.".into());
    }
    let mut config = Config::default();
    config
        .floats(false)
        .allow_start_fn(false)
        .ignore_custom_sections(true)
        .wasm_multi_memory(false)
        .wasm_tail_call(false)
        .set_max_recursion_depth(64)
        .set_min_stack_height(1024)
        .set_max_stack_height(64 * 1024)
        .enforced_limits(EnforcedLimits::strict())
        .consume_fuel(true);
    let engine = Engine::new(&config);
    let module = Module::new(&engine, wasm)
        .map_err(|_| "Invalid scalar plugin or unsupported WebAssembly instructions.")?;
    if module.imports().next().is_some() {
        return Err("Scalar plugins cannot import functions or resources.".into());
    }
    Ok(module)
}

fn invoke(module: &Module, input: i64, fuel: u64) -> Result<(i64, u64), String> {
    let limits = StoreLimitsBuilder::new()
        .instances(1)
        .memories(1)
        .memory_size(MEMORY_BYTES)
        .tables(1)
        .table_elements(64)
        .trap_on_grow_failure(true)
        .build();
    let mut store = Store::new(module.engine(), limits);
    store.limiter(|limits| limits);
    store
        .set_fuel(fuel)
        .map_err(|_| "Could not set the scalar plugin execution budget.")?;
    let instance = Linker::new(module.engine())
        .instantiate_and_start(&mut store, module)
        .map_err(|_| "Scalar plugin could not be instantiated within its resource limits.")?;
    let evaluate = instance
        .get_typed_func::<i64, i64>(&store, ENTRY)
        .map_err(|_| "Export marketweft_scalar_v1 with signature (i64) -> i64.")?;
    let value = evaluate.call(&mut store, input).map_err(|cause| {
        if cause.as_trap_code() == Some(TrapCode::OutOfFuel) {
            "Scalar plugin exhausted its execution budget."
        } else {
            "Scalar plugin stopped with a WebAssembly trap."
        }
    })?;
    let remaining = store
        .get_fuel()
        .map_err(|_| "Could not read the scalar plugin execution budget.")?;
    Ok((value, fuel - remaining))
}
