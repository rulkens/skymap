# Local-Volume Distances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace cz-derived positions with redshift-independent catalog distances (Cosmicflows-4 primary, HyperLEDA `mod0` fallback) for every 2MRS / GLADE / Famous row inside 30 Mpc, while preserving the original spectroscopic z for InfoCard display.

**Architecture:** Bake the override at build time inside `tools/catalog/buildAllBins.ts`. A pure `catalogDistanceFor(record)` function consults a CF4 lookup, then HyperLEDA, returning a `{ distMpc, source } | null`. When non-null and `< CUTOFF_MPC = 30`, position is computed via `raDecDistToCartesian` instead of `raDecZToCartesian`. Spectroscopic z gets its own `Float32` slot in the binary format (v6 bump, consuming 4 of the 10 trailing-padding bytes — no stride change). InfoCard reads the stored z instead of recovering it from `|position|`.

**Tech Stack:** TypeScript + Node 20 + tsx for the build pipeline; Vitest for tests. CF4 raw source: CDS Vizier table J/ApJ/944/94 (Cosmicflows-4, Tully+ 2023). HyperLEDA `mod0` reuses the existing meandata fetcher.

---

## Plan structure

This plan is split across four files in this directory; execute them in order:

1. **[`2026-05-27-local-volume-distances-01-fetcher.md`](./2026-05-27-local-volume-distances-01-fetcher.md)** — CF4 raw-data acquisition: resumable fetcher (`tools/fetch/fetchCosmicflows4.ts`), ReadMe-style on-disk header doc, and the HyperLEDA `mod0` column extension. (~9 tasks)
2. **[`2026-05-27-local-volume-distances-02-parser-lookup.md`](./2026-05-27-local-volume-distances-02-parser-lookup.md)** — CF4 TSV → typed records parser (`tools/parsers/cosmicflows4.ts`) and the pure `catalogDistanceFor` lookup function with CF4 → HyperLEDA fallback. (~7 tasks)
3. **[`2026-05-27-local-volume-distances-03-format-v6.md`](./2026-05-27-local-volume-distances-03-format-v6.md)** — Bin format v6 bump (`spectroscopicZ: Float32`) at byte offset 54; encoder, decoder, GalaxyCatalog type, round-trip tests, regenerate-error confirmation. (~6 tasks)
4. **[`2026-05-27-local-volume-distances-04-wire-and-display.md`](./2026-05-27-local-volume-distances-04-wire-and-display.md)** — Wire the override into `buildAllBins`, plumb `spectroscopicZ` through `ParsedRecord` and `recordsToCloud`, point `galaxyInfoBuilder` at the new field, regression-test known-distance fixtures (M31, M33, M86, NGC 4486), bump CLAUDE.md / docstrings, run the final build-tiers + sync. (~10 tasks)

---

## Bin-format decision: v6 with new `spectroscopicZ: Float32` field

**Recommendation: bump to v6 and add `spectroscopicZ` as a new Float32 at byte offset 54.**

### Layout impact

The current v5 record uses bytes 0–53 and leaves 10 bytes of padding at offset 54–63. v6 consumes 4 of those 10 bytes:

```
54      4     spectroscopicZ   (float32) — published z BEFORE distance override (NEW in v6)
58      6     padding          (zeroed; reserved for future per-record metadata)
```

Stride stays 64 bytes. File size stays `16 + count × 64`. The encoder/decoder gain a single field; the header version uint32 flips 5 → 6.

### Why not spare bits / smaller field?

The two alternative encodings I considered:

1. **`uint16` quantised z** (2 bytes): Would fit in spare padding without exhausting it, but local-volume z values span roughly `-0.002` to `+0.010`. A symmetric 16-bit fixed-point quantisation with ±0.05 range gives ~1.5e-6 step, which is finer than the catalog's own precision — but you have to commit to a fixed range *now*, and any future need to store quasar z (Milliquas reaches z ≈ 7) hits the wall hard. Float32 is the universal answer and we already use it for every other physical quantity in the record. The 2-byte saving doesn't justify a non-uniform encoding.

2. **Half-precision (`float16`)** (2 bytes): Smallest normal float16 is ~6e-5, larger than Local-Group blueshift magnitudes (M31's z = −9.4e-4 quantises cleanly, but M33's z = −1.8e-4 and Sculptor Dwarf's z ≈ +7e-5 sit near the subnormal floor). Mantissa is 10 bits ≈ 3 decimal digits of precision. We'd be reintroducing exactly the precision-loss problem PR #186's linear-sign fallback fixed. Net: not worth saving 2 bytes.

A clean `float32` field has none of those failure modes and matches every other physical-quantity slot in the record. Six bytes of padding remain for future per-record fields.

### Why v6 (loud break) rather than backward-compat parse?

The decoder's existing version check throws `unsupported version: <N> — please regenerate the .bin via "npm run build-tiers"` (galaxyCatalogFormat.ts:142–146). That's the exact behaviour we want for stale clients: noisy, instructive, and uncrossable. v5 → v6 trips it the same way v4 → v5 did. A silent fallback (decode v5 with `spectroscopicZ = NaN`) would let buggy display code ship behind a stale .bin for weeks.

---

## What's deliberately out of scope

Mirrors the spec's "Out of scope" section and adds two implementation-level deferrals:

- **No peculiar-velocity field correction.** Just the catalog override inside 30 Mpc.
- **No per-galaxy distance uncertainty in the bin.** CF4 publishes `e_DM` but storing it would need a second field; revisit when the InfoCard wants to surface ± values.
- **No CF4-only galaxies.** Overrides existing 2MRS/GLADE/Famous rows; never adds new ones. (Spec decision #2.)
- **No automatic HyperLEDA re-fetch.** The cache is intentionally partial (per memory `project_hyperleda_partial_cache`); the plan adds the `mod0` column to the existing meandata pull but does NOT re-run the full ~1.5M PGC sweep. Existing 52k cached rows get the column on their next single-row fetch — most never will.
- **Bin-format `provenance` byte.** Tempting to add a per-record "distance came from CF4 / HyperLEDA / cz" enum byte for the InfoCard. Deferred: the InfoCard can derive it at build time inside `recordsToCloud` and surface it through `GalaxyInfo` without adding a runtime field.

---

## Worktree note (per memory `project_worktree_data_isolation`)

Feature work happens in a dedicated worktree. The `.bin` outputs of `npm run build-tiers` from the worktree are **throwaway** — they live in the worktree's own `public/data/` and never sync to R2. The final production `.bin`s must be rebuilt from the **main** worktree after merge, then `npm run sync-r2-secure` from there. Task list 4 calls this out explicitly at the cutover step.

---

## Self-review

- [x] Spec section "What it is" → covered by sub-plans 1–4 end-to-end.
- [x] Spec section "Goal" → sub-plan 2 (`catalogDistanceFor`) + sub-plan 4 (wire in `buildAllBins`).
- [x] Spec section "Data source candidates" → CF4 primary in sub-plan 1; HyperLEDA `mod0` fallback in sub-plans 1 + 2; NED-D / EDD explicitly skipped.
- [x] Spec section "Integration approach" → sub-plan 4 Task 1 (the override loop in `recordsToCloud`).
- [x] Spec section "Cross-matching" → sub-plan 2 Task 3 (lookup keyed by 2MASS XSC + PGC).
- [x] Spec section "File-format impact" → sub-plan 3 (full format v6 implementation).
- [x] Resolved decision #1 (`CUTOFF_MPC = 30`) → constant defined in sub-plan 2.
- [x] Resolved decision #2 (overrides only) → enforced by the "match-or-fall-through" structure in sub-plan 2 Task 3.
- [x] Resolved decision #3 (unmatched stays on cz) → fall-through path in sub-plan 4 Task 1.
- [x] Resolved decision #4 (resumable fetcher) → sub-plan 1 Tasks 1–4 (chunked download + resume).
- [x] Resolved decision #5 (store original z separately) → sub-plan 3 (format v6) + sub-plan 4 (InfoCard wiring).
- [x] Regression fixtures (M31, M86, …) → sub-plan 4 Tasks 7–8.
- [x] Final R2 sync from main worktree → sub-plan 4 Task 10.
