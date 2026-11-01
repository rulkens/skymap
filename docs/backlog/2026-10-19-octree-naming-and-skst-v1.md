# Octree naming is single-catalog; the star family keeps two live formats

**Readiness:** `needs-design`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

#919 made the octree container family-neutral, but the star family's prefix is still the hand-typed literal `'star-catalog/v2'` (`src/data/octree/starOctreeFamily.ts:30`) beside an `OCTREE_VERSION` of 1, so a version bump would not move the folder. DATA.md and `format: 'skst' | 'octree'` keep SKST v1 and the Rust v1 port alive beside v2.

## Direction

Derive each family's data prefix from `OCTREE_VERSION` (`octreeDataPrefix(family)`); retire SKST v1 and the Rust v1 port once no tier reads them. Folds into the format-table item when ADR 0016 lands.
