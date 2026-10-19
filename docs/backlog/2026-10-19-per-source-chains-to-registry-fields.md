# Per-source behaviour sits in `if (source === X)` chains with silent defaults

**Readiness:** `needs-design`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`buildGalaxyInfo.ts:109-188` (catalogue link, orientation and diameter provenance), `estimateLog10StellarMass.ts:106-118` (NaN default), `sourceClass.ts:126-133`, `encodeGalaxyId.ts:38`, `buildFilaments.ts:486`, the mcpm-workbench `catalogSlice.ts:40-47`, `TOGGLEABLE_SOURCES` (`GalaxiesSection.tsx:27`) and the website's `dataSources.ts` row counts are all silent per-source edits a new survey has to find.

## Direction

Registry fields (`objIdKind`, `catalogueLink`, `orientationProvenance`, `massEstimator`, `toggleable`) and chains made total over them, so a row without a field fails typecheck. Pairs with the source-registry-factory item.
