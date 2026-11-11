# Rust tools: registry paths + CI for stars-rs

**Readiness:** `ready`.

`tools/cloud-bake-rs` joined the repo with its paths filled by a launcher from the raw-data registry and
its tests in a CI job (`cloud-bake-rs` in `.github/workflows/ci.yml`). `tools/stars-rs` did neither:

- It joins `data/raw/...` paths itself instead of reading them from `rawDataRegistry.ts`; the npm script
  `build-stars-rs` passes only `--out`. Give it path flags and a TS launcher like `tools/clouds/bakeClouds.ts`.
- No CI job runs its `cargo test`; add one beside `cloud-bake-rs` (same toolchain and cache steps, its own
  `workspaces` and `--manifest-path`).

Raised by the cloud-bake design's ground check (2026-11-10).
