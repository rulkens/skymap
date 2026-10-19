# DESI deep links encode TARGETID as a PGC id

**Readiness:** `needs-verification`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Claim to verify

Reported by the pipeline audit: DESI rows carry TARGETID in `objID` (`tools/parsers/desiFits.ts:269`), the galaxy id encoder emits `pgc-<objID>` for any source other than SDSS, and `galaxyCatalogSelectionRow.ts:88`'s `resolvePgc` searches only GLADE and 2MRS. If so, a `#focus=` link to a DESI galaxy never resolves.

## Next

Write the failing test (encode a DESI selection, resolve it from the hash); if it fails, fix by giving the registry row an `objIdKind` and encoding by it. If it passes, delete this item.
