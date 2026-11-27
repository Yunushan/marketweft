fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("cargo:rerun-if-changed=proto/research.proto");
    let descriptors = protox::compile(["proto/research.proto"], ["proto"])?;
    let mut builder = tonic_prost_build::configure();
    for message in [
        "FormulaQuery",
        "FormulaFunction",
        "ScreenQuery",
        "OptionQuery",
    ] {
        builder = builder
            .type_attribute(message, "#[derive(serde::Deserialize)]")
            .type_attribute(message, "#[serde(deny_unknown_fields)]");
    }
    for message in [
        "FormulaRow",
        "FormulaPage",
        "Close",
        "ScreenRow",
        "ScreenPage",
        "OptionPage",
        "OptionUnderlying",
        "OptionRow",
        "OptionModel",
    ] {
        builder = builder.type_attribute(message, "#[derive(serde::Serialize)]");
    }
    for field in [
        "FormulaQuery.offset",
        "FormulaQuery.limit",
        "ScreenQuery.offset",
        "ScreenQuery.limit",
        "OptionQuery.max_age",
        "OptionQuery.offset",
        "OptionQuery.limit",
    ] {
        builder = builder.field_attribute(
            field,
            "#[serde(default, deserialize_with = \"crate::analytics::present\")]",
        );
    }
    builder
        .field_attribute("FormulaQuery.functions", "#[serde(default)]")
        .compile_fds(descriptors)?;
    Ok(())
}
