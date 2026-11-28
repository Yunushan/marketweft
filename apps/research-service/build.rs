fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("cargo:rerun-if-changed=proto/research.proto");
    let descriptors = protox::compile(["proto/research.proto"], ["proto"])?;
    let mut builder = tonic_prost_build::configure();
    for message in [
        "FormulaQuery",
        "MonthlyReturnsQuery",
        "MacroCalendarQuery",
        "FormulaFunction",
        "ScreenQuery",
        "RankComparisonQuery",
        "PortfolioScenariosQuery",
        "PortfolioScenarioAllocation",
        "PortfolioFxQuery",
        "PortfolioFxAmount",
        "OptionQuery",
        "AmericanOptionQuery",
    ] {
        builder = builder
            .type_attribute(message, "#[derive(serde::Deserialize)]")
            .type_attribute(message, "#[serde(deny_unknown_fields)]");
    }
    for message in [
        "FormulaRow",
        "FormulaPage",
        "MonthlyReturnsClose",
        "MonthlyReturnsRow",
        "MonthlyReturnsPage",
        "MacroCalendarRow",
        "MacroCalendarPage",
        "Close",
        "ScreenRow",
        "ScreenPage",
        "RankComparisonLeg",
        "RankComparisonRow",
        "RankComparisonPage",
        "PortfolioScenariosPage",
        "PortfolioScenarioCoverage",
        "PortfolioScenarioPercentiles",
        "PortfolioScenarioPath",
        "PortfolioFxPage",
        "PortfolioFxRow",
        "PortfolioFxRate",
        "OptionPage",
        "OptionUnderlying",
        "OptionRow",
        "OptionModel",
        "AmericanOptionResponse",
        "AppliedDividend",
    ] {
        builder = builder.type_attribute(message, "#[derive(serde::Serialize)]");
    }
    for field in [
        "FormulaQuery.offset",
        "FormulaQuery.limit",
        "MonthlyReturnsQuery.offset",
        "MonthlyReturnsQuery.limit",
        "MacroCalendarQuery.offset",
        "MacroCalendarQuery.limit",
        "ScreenQuery.offset",
        "ScreenQuery.limit",
        "RankComparisonQuery.offset",
        "RankComparisonQuery.limit",
        "PortfolioScenariosQuery.block_size",
        "PortfolioScenariosQuery.offset",
        "PortfolioScenariosQuery.limit",
        "PortfolioFxQuery.offset",
        "PortfolioFxQuery.limit",
        "OptionQuery.max_age",
        "OptionQuery.offset",
        "OptionQuery.limit",
        "AmericanOptionQuery.max_age",
        "AmericanOptionQuery.steps",
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
