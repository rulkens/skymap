# Manifest v2 with provenance; R2 prune against the last N manifests

**Readiness:** `awaiting-decision`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`DataManifest.d.ts` is `logical → hashed`. `dataFamilyOf.ts:20-26` matches basenames at any depth, so old epoch folders stay manifested and uploaded; `rclone copy` never deletes and pruning is manual (`docs/DEPLOY.md:47`); `buildAllBins.ts:580` picks the newest SDSS CSV by mtime. No one can say which inputs or commit produced a deployed bin.

## Blocked on

ADR 0015 §3. Independent of the format table.
