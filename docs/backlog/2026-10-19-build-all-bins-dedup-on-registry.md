# `buildAllBins` dedup rank and modes move onto the registry row; missing inputs fail hard; outputs stage atomically

**Readiness:** `needs-design`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`crossMatch.ts:76-88,174` takes named inputs and the concat order is the priority; the registry's `priority` is a fetch rank. `buildAllBins.ts:372-379,580-583,744-754` turns a missing input into `[]`, and only present sources are rewritten (`:870-916`), so a run without SDSS leaves the old `sdss-*.bin` beside a GLADE that now keeps the SDSS-footprint duplicates: double rendering, manifested and synced. DESI patches against the base grid; Milliquas bypasses (`:832-844`). The 5″ and 1 % Δz rule is wrong for photo-z surveys (REGALADE). Stars already need a 16 GB heap; REGALADE's 71.5 M rows will not fit the parse-everything model.

## Direction

`dedupRank` and `dedupMode: 'base' | 'patch' | 'bypass'` on the galaxy-catalog registry row; `crossMatch` takes an ordered list; a missing requested input is a hard error; outputs stage into a temp dir and swap atomically; parsed records cache per source. REGALADE is the forcing function; the existing REGALADE wiring line depends on this.
