# Path-compress single-record chains in the star octree

**Readiness:** `needs-design`. **Surfaced:** 2026-10-11, the spec section on measured findings for #885.

## Problem

In the pool, node rows weigh about as much as the records (medium: cut-nodes 33.8 MB against records 34.4 MB,
1.35 M rows for ~12.6 records a row), so shrinking the rows would roughly halve the pool. The bake measurement found
the tree is not chain-bound (12.6 records per row), so how much compression removes is unproven.

## Constraint

The ruling at the time was to keep pure `L(M)` placement and revisit after the A/B. Compression changes the refine
proxy's per-level monotonicity the cut relies on (`cut.wesl` header), so it needs a design pass first; count the
single-child chains in the real bake before designing.
