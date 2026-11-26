# Custom formula functions

Load a UTF-8 JSON library under **Time-series formulas** → **Custom formula functions**. Select **Load function library**, use its functions in your formula and choose **Evaluate formula**. The active library belongs to the research view. Select **Clear function library** to return to the built-in functions.

Import the packaged `formula-bars.csv`, load `formula-library.mwformula.json` and evaluate `smooth(close)`. At 2025-04-03T14:04:00Z, the last value is 14.5. Move one minute forward for 16.833333, then rewind for a byte-identical CSV. When a run used a library, its CSV includes the filename and SHA-256 of the exact library bytes. **Download evaluated function library** saves those bytes. [Sample library](../crates/core/tests/fixtures/synthetic-formula-library.mwformula.json).

## Library format

The four fields are `format`, `libraryVersion`, `languageVersion` and `functions`. Use `marketweft.formula-library` as the format and 1 as both version values. Each function has a `name`, a `parameters` array and a `body` string.

```json
{
  "format": "marketweft.formula-library",
  "libraryVersion": 1,
  "languageVersion": 1,
  "functions": [
    { "name": "difference", "parameters": ["a", "b"], "body": "a - b" },
    { "name": "smoothed", "parameters": ["a", "b"], "body": "sma(difference(a, b), 2)" }
  ]
}
```

Call `smoothed(high, low)` to pass the two bar fields explicitly. Function bodies evaluate expressions over their arguments and can call functions earlier in the same library. This declaration order keeps function dependencies acyclic. Built-in names are reserved. [Version 1 expression grammar](time-series-language.md).

A library supports up to 16 functions and 48 KiB of JSON. Each function takes one to four distinctly named parameters. Function and parameter names start with an ASCII letter or underscore and contain up to 32 ASCII letters, digits or underscores. Each body has the same source and parser bounds as an ordinary formula. The interpreter also caps expanded expressions at 512 nodes and the run at four million node-row pairs.

An invalid import preserves the active library and the previous result. If the current formula cannot compile after clearing the library, the previous successful result remains available with its original inputs. Use **Backtest formula functions** to apply the same kind of library to paper signals or include it in a version 2 strategy package. [Formula strategy packages](formula-strategy-packages.md).
