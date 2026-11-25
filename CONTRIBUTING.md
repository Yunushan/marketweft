# Contributing

Use a small branch per behavior. Include the requirement ID, a reproducible acceptance case, test commands and observed results. State the input scale, rounding, time basis, missing-value behavior and provenance for each new calculation. Preserve old fixtures when introducing a schema version.

Add original contributions under 0BSD. For a new dependency include its purpose, exact license expression, selected license where alternatives exist, transitive dependencies and any notices required by a distributed artifact. Use lockfiles for both Cargo workspaces and npm. Follow the license gate instructions in THIRD_PARTY_NOTICES.

Update the coverage and platform matrices when changing a claim. New execution capabilities require a separate design review covering operator authorization, idempotency, limits, audit and emergency stop before enabling them. Never include credentials or non-redistributable feeds in fixtures.

For README changes, update the matching section in every edition under `docs/readme/`. Preserve the section markers, relative navigation and runnable examples across editions. Run `python -B scripts/check_readmes.py` from the repository root. Review translated meaning and register alongside the structural check.
