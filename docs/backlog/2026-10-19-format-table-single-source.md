# One format table every decoder, DATA.md and the deploy allow-list read

**Readiness:** `awaiting-decision`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

See ADR 0016 (`docs/adrs/0016-data-contracts.md`) §1. Folder drift today: `starOctreeFamily.ts:30` hand-types `'star-catalog/v2'` beside `OCTREE_VERSION = 1`; meshes (`meshBinaryFormat.ts:14`) and tracks (`writeSpacecraftTracks.ts:22` / `parseSpacecraftTracks.ts:19`, a duplicated literal) have no epoch folder; `dataFamilies.ts:34,43` re-types folder names; DATA.md's table counted seven of what are now eleven families, SATG included (fixed 2026-10-19).

## Blocked on

ADR 0016's acceptance. The typed-error item lands first and independently.
