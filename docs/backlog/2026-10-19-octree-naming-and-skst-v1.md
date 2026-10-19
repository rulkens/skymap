# Octree naming is single-catalog; the star family keeps two live formats

**Readiness:** `needs-design`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`octreeFormat.ts:12-17,69,94-103`: a generic container with a `'star-catalog/v2'` prefix and star LUT imports. `buildStars.ts:556` writes `'stars'` instead of the row's `binBaseName`. DATA.md:183 and `format: 'skst' | 'octree'` keep SKST v1 and the Rust v1 port alive. A second octree catalog (a Hipparcos split, galaxy octree streaming) needs new hand-typed prefixes.

## Direction

`octreeDataPrefix(family)` derived from `OCTREE_VERSION`; builders take `binBaseName` from the row; retire SKST v1 and the Rust v1 port once no tier reads them.
