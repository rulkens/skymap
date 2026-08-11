# Default filament build silently drops GLADE

Found 2026-08-10 during the format-v9 consumer sweep.

## Evidence

- `tools/filaments/buildFilaments.ts:473-476` — `ALL_SOURCE_FILES` names
  un-tiered `sdss.bin` / `2mrs.bin` / `glade.bin`.
- The tiered pipeline (`npm run build-tiers`) emits only per-tier variants
  (`glade-{small,medium,large}.bin`, `sdss-{medium,large}.bin`); of the
  three names only `2mrs.bin` exists in `public/data/` today.
- `buildFilaments.ts:526-528` — a missing source file is a one-line stderr
  warning + `continue`, so the default 2MRS+GLADE merged build completes
  "successfully" as **2MRS-only**. The shipped `filaments.bin` does not
  contain what the load-bearing 2MRS+GLADE-only DisPerSE default
  (SDSS-wedge decision) intends.

## Decision needed

Which GLADE input should feed DisPerSE:

1. Point the entry at `glade-large.bin` (largest tier that exists) —
   one-line fix, but the tier's abs-mag subsample differs from the full
   catalog the un-tiered file used to carry.
2. Re-emit un-tiered full-catalog bins from `buildAllBins` as build-input
   artifacts (kept out of R2 by `allowDataFile`, like `filaments-sdss.bin`).
3. Make a missing *requested* source a hard error either way — the silent
   skip is what let this ship.

## Interaction with format v9

The v9 plan (2026-08-10) moves galaxy bins under `galaxy-catalog/v9/` and
adds a version pre-check to `buildFilaments`; it deliberately does NOT fix
this (recorded in its deferral boundary). Fix after v9 lands, against the
new paths.
