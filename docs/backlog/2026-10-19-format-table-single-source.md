# One format table every decoder, DATA.md and the deploy allow-list read

**Readiness:** `awaiting-decision`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

See ADR 0015 (`docs/adrs/0015-data-contracts.md`) §1. Folder drift today: `octreeFormat.ts:21,69` (`OCTREE_VERSION = 1`, prefix `'star-catalog/v2'`); meshes (`meshBinaryFormat.ts:14`) and tracks (`writeSpacecraftTracks.ts:22` / `parseSpacecraftTracks.ts:19`, a duplicated literal) have no epoch folder; `dataFamilies.ts:34,43` re-types folder names; DATA.md's table counted seven (fixed to ten 2026-10-19).

## Blocked on

ADR 0015's acceptance. The typed-error item lands first and independently.
