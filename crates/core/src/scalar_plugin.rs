use wasmi::{Config, EnforcedLimits, Engine, Linker, Module, Store, StoreLimitsBuilder, TrapCode};

pub const MAX_SCALAR_PLUGIN_BYTES: usize = 64 * 1024;
const FUEL_PER_CALL: u64 = 100_000;
const MEMORY_BYTES: usize = 2 * 1024 * 1024;
const ENTRY: &str = "marketweft_scalar_v1";

/// Evaluate one signed-millionth value in a fresh integer-only WebAssembly instance.
pub fn evaluate_scalar_plugin(wasm: &[u8], input: i64) -> Result<i64, String> {
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

    let limits = StoreLimitsBuilder::new()
        .instances(1)
        .memories(1)
        .memory_size(MEMORY_BYTES)
        .tables(1)
        .table_elements(64)
        .trap_on_grow_failure(true)
        .build();
    let mut store = Store::new(&engine, limits);
    store.limiter(|limits| limits);
    store
        .set_fuel(FUEL_PER_CALL)
        .map_err(|_| "Could not set the scalar plugin execution budget.")?;
    let instance = Linker::new(&engine)
        .instantiate_and_start(&mut store, &module)
        .map_err(|_| "Scalar plugin could not be instantiated within its resource limits.")?;
    let evaluate = instance
        .get_typed_func::<i64, i64>(&store, ENTRY)
        .map_err(|_| "Export marketweft_scalar_v1 with signature (i64) -> i64.")?;
    evaluate.call(&mut store, input).map_err(|cause| {
        if cause.as_trap_code() == Some(TrapCode::OutOfFuel) {
            "Scalar plugin exhausted its execution budget.".into()
        } else {
            "Scalar plugin stopped with a WebAssembly trap.".into()
        }
    })
}
