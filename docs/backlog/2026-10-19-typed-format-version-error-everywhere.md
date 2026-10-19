# Every decoder throws `FormatVersionError`

**Readiness:** `ready`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`galaxyCatalogFormat.ts:243` is the only `FormatVersionError` site. `retryPolicy.ts:31` gives up only on that type and `installFormatVersionAlert.ts:26` alerts only on it. SKST (`starCatalogFormat.ts:343`), octree (`readOctreeHeader.ts:22`), CCAT (`structureCatalogFormat.ts:125`), SCFD (`scalarFieldFormat.ts:211`), FILA (`filamentBinaryFormat.ts:99`), SHEL (`shellMeshFormat.ts:111`), SKMH (`meshBinaryFormat.ts:86`), SCTK (`parseSpacecraftTracks.ts:19`) and SHGT throw plain `Error`, so a stale client re-downloads tens of MB twice and then shows nothing.

## Direction

One `assertFormatVersion(magic, expected, buf)` helper throwing `FormatVersionError`, called from all ten decoders; a test that every format module's decoder throws the typed error on a bumped header. Does not wait for ADR 0015's table; the table later reads the same helper.
