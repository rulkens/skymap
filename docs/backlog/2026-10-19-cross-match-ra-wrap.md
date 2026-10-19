# Cross-match ignores the RA wrap at 0/360

**Readiness:** `ready`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`tools/catalog/crossMatch.ts:93` keys cells by `floor(ra)|floor(dec)`, `:121` walks `cx±1`, and `:105` computes `dRa = (ra1 - ra2) * cos(dec)`. A pair at RA 359.99 and 0.01 is 0.02° apart but lands in cells 359 and 0 with a raw difference of 359.98°, so it is never merged.

## Direction

Reproduce as a failing test with a pair across the wrap, then wrap the cell neighbour and the RA difference (`((dRa + 540) % 360) - 180`). Measure the bin diff after a rebuild; expect a small count drop.
