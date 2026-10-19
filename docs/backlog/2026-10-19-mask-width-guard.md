# Interim guard: `maskWith` and `packSelection` assert their widths

**Readiness:** `ready`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`maskWith.ts:10` and `maskHas.ts:15` shift by the raw source code; code 36 already aliases bit 4 and the next free galaxy code 37 aliases bit 5. `packSelection` (`selectionEncoding.ts:54-56`) has no `localIdx < 2^26` assertion.

## Direction

Throw in `maskWith` / `maskHas` for a code ≥ 32 and in `packSelection` for an index ≥ 2^26, with a test for each. One PR, a day; it holds until ADR 0013 lands and is deleted with it.
