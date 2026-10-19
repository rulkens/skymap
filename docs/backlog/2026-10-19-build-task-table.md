# A build task table with a topo-sorting runner; a missing declared input fails

**Readiness:** `needs-design`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`buildFilaments.ts:486-488,541-545` reads `glade.bin`/`sdss.bin`, which the tiered pipeline no longer writes; the default build warns and ships 2MRS-only filaments (the existing "Default filament build silently drops GLADE" line). `build-structures` and `build-famous` "must run after `build-tiers`" only per DATA.md:136-158. Every npm script chains `build-data-manifest` by hand (`package.json:39-69`).

## Direction

A small table of builders with declared inputs and outputs (raw-registry keys and artefact paths), a runner that topo-sorts, fails on a missing declared input, and runs the manifest once at the end. Subsumes the GLADE-skip line once it lands.
