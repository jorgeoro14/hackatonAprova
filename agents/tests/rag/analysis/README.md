# Local phase reports

Explicit live runs save `phase1_results.json/csv`, `phase2_results.json/csv` and
`phase3_results.json/csv` here by default. Generated files are ignored by Git.
Run configurations, snapshot identities, source IDs, scalar metrics and errors
are recorded. Raw questions, answers, excerpts and provider exceptions are not
written to these reports. A newer run of the same phase replaces its reports;
use `--output-dir` for a separate run directory when retaining comparisons.
