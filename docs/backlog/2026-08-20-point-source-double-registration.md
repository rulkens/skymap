# De-duplicate point-source registration between `GALAXY_CATALOG_SOURCE_REGISTRY` and `ASSET_WIRING`

Surfaced by `docs/research/engine/decisions.md`'s "Spun off to backlog" list
and [`subsystem-sweep.md`](../research/engine/subsystem-sweep.md)'s "Galaxy
point cloud" table row (non-fit notes column, `:11`): "Point sources
double-registered: real construction in `GALAXY_CATALOG_SOURCE_REGISTRY`, a
second row in `ASSET_WIRING` purely for demand+req." `ORPHAN` in the
2026-08-20 carry-forward audit — `decisions.md` says "spun off to backlog"
but no `docs/backlog/` file or `BACKLOG.md` line was ever filed for this
specific claim. (Not to be confused with the adjacent
[Source-registry factory](2026-06-29-source-registry-factory.md) backlog
item, which is a broader, different proposal — auto-generating fetcher/slot/
UI rows from one `SOURCE_REGISTRY` entry — not a citation of this
duplication.)

## What it is

Each galaxy catalog source (SDSS, 2MRS, GLADE, DESI, Milliquas, etc.) is
registered twice:

- **`GALAXY_CATALOG_SOURCE_REGISTRY`**
  (`src/services/engine/wiring/galaxyCatalogSourceRegistry.ts`) — the real
  construction: 9 rows minting `AssetSlot`s in `initGpu`, per
  `subsystem-sweep.md`'s table.
- **`ASSET_WIRING`** — a second row per source that exists purely to carry
  `demand` + `req` (the asset-demand-loop plumbing), duplicating identity
  the first registry already owns.

This is listed in `subsystem-sweep.md`'s vocabulary anchors alongside other
named collisions: "`SOURCE_REGISTRY`/`SOURCE_ENTRIES`, `GALAXY_CATALOG_SOURCE_REGISTRY`
(+companions/`CompanionAssetReq`; **COLLISION**: point sources declared in
both this and `ASSET_WIRING`)."

## Why it matters

Cleanup / duplication: two registries agreeing about the same 9 sources by
construction, not by a shared reference. A new galaxy source (or a removed
one) has to be added to — or remembered to be removed from — both tables; a
mismatch between them wouldn't necessarily fail loudly, since each registry
is consumed by different downstream machinery (construction vs. the demand
loop).

## Approach

No design done. The shape to investigate:

- Whether `ASSET_WIRING`'s per-source row can be derived from
  `GALAXY_CATALOG_SOURCE_REGISTRY` (a `demand`/`req` field added to the
  existing registry row, with `ASSET_WIRING` generating its point-source
  rows by mapping over it) rather than hand-duplicated.
- Whether this is best done standalone, or as part of a broader pass if the
  [Source-registry factory](2026-06-29-source-registry-factory.md) item
  (auto-generating fetcher + slot + UI rows from one `SOURCE_REGISTRY`
  entry) is ever picked up — that item's scope is wider (all sources, not
  just galaxy points) and could subsume this fix, but is `needs-design` and
  not currently scheduled, so this item should not wait on it.
- Confirm at pickup time whether `willSourceReload.ts` or
  `makeRunTierTransition.ts` (both reference
  `GALAXY_CATALOG_SOURCE_REGISTRY`) encode any assumption about the two
  registries staying separate before collapsing them.
