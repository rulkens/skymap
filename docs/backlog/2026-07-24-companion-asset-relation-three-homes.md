# The companion-asset relation has three homes

`needs-design`

## The problem

"`famousGalaxiesMeta` rides the Famous catalog" is one fact, authored three
times in three mechanisms that can each be satisfied without the
others:

1. `companions: ['famousGalaxiesMeta']` on the Famous row of
   `GALAXY_CATALOG_SOURCE_REGISTRY`
   (`src/services/engine/wiring/galaxyCatalogSourceRegistry.ts:74`),
   consumed by `loadCompanionAssets` on tier transition only.
2. `demand: (ctx) => ctx.slotState(Source.FamousGalaxy) !== 'idle'` on
   the `famousGalaxiesMeta` row of `ASSET_WIRING` — the boot path, and the only
   one that runs at boot.
3. `priority: 21`, authored to sit "immediately behind its `.bin` (20)"
   in the fetch-rank table.

Add a second companion (the star catalog's meta is already a candidate
— `famous_stars_meta.json` is on the backlog for exactly this
treatment) and all three have to be edited in step, with nothing
connecting them.

## The consequence the queue surfaced

Expressing the relation as a demand predicate over a sibling's slot
state makes demand a function of the fetch SCHEDULE, not just of user
intent. With the bounded queue in front of the loads, Famous no longer
starts in the pass that demands it whenever two higher-ranked rows are
ahead, so `famousGalaxiesMeta` is not demanded until a later pass. Production
is fine — `reevaluateDemand` re-runs every frame — but the demand table
test now has to drive `reevaluateDemand` to a FIXPOINT, draining the
queue between passes, to state what the boot set is
(`tests/services/engine/wiring/demandTable.test.ts`, `firedKeys`). A
test that has to iterate to describe a table is the tell.

## Directions to explore (design decides)

- Make the companion relation the one mechanism: give `AssetWiringRow`
  an optional `companionOf: AssetKey`, derive both the demand predicate
  and the rank (companion rank = parent rank + 1) from it, and let
  `loadCompanionAssets` read the same field instead of a per-source
  list.
- Or keep the registry list as the home and derive the wiring rows from
  it, which folds into the source-registry-factory item.
- Either way the predicate "the parent is no longer idle" should stop
  being hand-written per companion; it is the definition of the
  relation, not a policy choice.

## Related

- `backlog/2026-06-29-source-registry-factory.md` — generating the
  wiring rows from `SOURCE_REGISTRY` would subsume this.
- `docs/BACKLOG.md`: `famous_stars_meta.json` fetches unconditionally at
  boot — the second companion, currently wired by neither mechanism.
