# Delete the v1 SKST star path

**Readiness:** `ready`. **Surfaced:** 2026-10-13, deletion audit at `/feature-done` of #885 (ruling E: its own PR, after #885 merges).

The Gaia row hard-codes `format: 'octree'`; the v1/v2 A/B is over and nothing in production reads SKST. Measured
at audit time: src −640, tools −460, tests −440 removed / +150–250 re-fixtured.

**Delete**

- `src`: the SKST half of `starCatalogFormat.ts` (header narrative, magic/version/prefix/sizes, pack/unpack,
  encode/decode/empty), `starBinCodec.ts`, `starOctreeFromSkst.ts`, `SkstCatalog.d.ts`, `SkstNode.d.ts`,
  `StarCatalogFormat.d.ts` + the `format` field + the fetcher's skst branch, `STAR_OFFSET_LEVELS` (no readers since
  `0948af5c4`), and SKST mentions in `StarOctree`, `StarColumns`, `StarSourceBudgets`, `StarCatalogReq`,
  `resolveStarRecord`, `starCutLayout`.
- `tools`: `tools/stars/buildStarOctree.ts` (no production caller; it is a test-fixture builder) and the
  `star-catalog-v1` `DATA_FAMILIES` row.
- `tests`: `starOctreeFromSkst`, `starBinCodec`, `starCatalogRecord`, `buildStarOctree`, most of
  `starCatalogFormat`, the fetcher's v1 case.

**Keep:** the LUT block (`STAR_ABSMAG_*`, `STAR_COLORIDX_*`, the quantizers; move it to its own file) and
`mergeFluxAggregate` (`stratifyOctree` uses it).

**Cost:** 12 test files build octrees through `buildStarOctree` → `encodeSkstCatalog` → `starOctreeFromSkst` and need
fixtures through `stratifyOctree`/`chunkOctree` (start from `makeOctreeBuildInput`): fieldStarSpherePass,
watchSelectionRowsSaga, composeSelectionRows, resolveStarRecord, nearestResolvableStar, starCutLayout,
starCutLayout.parity, starCutGpu, starAggregateUpsamplePass, referenceStarCut, starCatalogFetcher,
starCatalogSourceCounts.

**Risks:** `stars-rs` still emits only v1, so its output cannot load until
[the v2 port](2026-10-13-stars-rs-v2-port.md) lands; the v1 files and manifest rows on R2 need their own cleanup.
