# Codex App Server schema baseline

These JSON Schema files were generated from Codex CLI `0.153.1` and are the
protocol compatibility baseline for PHITS AI Editor.

They are test fixtures, not runtime dependencies. Newer Codex versions may add
fields; the editor ignores unknown notifications and rejects unknown approval
decisions.

Regenerate with the matching CLI version:

```text
codex app-server generate-json-schema --out <directory>
```
