# Load-state consolidation (braid #1) — design

**Status:** ✅ SHIPPED via PR #309 (`75eef55c`). `slotReady(slot)` is the single
predicate (`src/services/loading/slotReady.ts`); the flow/filament status-mirror
stores are deleted; `EngineData` carries only galaxies + structures.

**Goal:** the "is it loaded?" fact for the flow and filament layers lives in
**one** home — the asset slot — read through a single predicate. Delete the two
status-only data stores that mirror it.

## Context

This is the first of two un-braidings carved out of a wider state-topology
review (the engine had "state all over the place"). The review found the engine
is mostly clean — settings is one home (PR #302), source masks derive cleanly,
bias splits input/output, asset slots are the authoritative load machine — and
that the real pain concentrates in two root braids:

- **Braid #1 (this doc):** load-state for flow/filaments is stored three times.
- **Braid #2 (separate, later):** fade policy is scattered (registration in 2
  places, driving in ~10), and a renderer reaches out to mutate the fade
  registry. The fade subsystem should own a declarative layer manifest + intent
  API; the same manifest is the #38 visibility-seam registry. Braid #2 also
  carries the small renderer-mirror cleanups (`flowFieldRenderer.hasField`,
  `selectionRingRenderer.currentSelection`).

The `flowFieldRenderer.setField → upload` rename (PR #303) already landed as a
standalone tidy; the renderer's install verb is settled as `upload`.

## The braid

For **flow** and **filaments**, "is it loaded?" exists in three places:

| Representation | Where | Verdict |
| --- | --- | --- |
| `LoadState.kind === 'ready'` | `state.assetSlots.flow` / `.filaments` | **authoritative** |
| `loaded` bool | `state.data.flow` / `state.data.filaments` | **mirror — delete** |
| `hasField` / GPU-resident geometry | `flowFieldRenderer` / `filamentRenderer` | renderer's own (braid #2 for `hasField`) |

The asset slot dispatches `'committed'` → `state().kind === 'ready'` **after**
`commit()` runs (the renderer `upload`), which is the same instant the store's
`setLoaded()` fires inside that commit. So `slot.current() != null` /
`slot.state().kind === 'ready'` is **semantically identical** to
`data.flow.loaded` ("committed to renderer") — the consolidation is exact, not
approximate.

### Why the other two stores stay

The right test is not "does a slot exist for it" but **"does the store hold
anything the slot's `current()` doesn't?"**

- **flow / filaments** → hold *only* a `loaded` bit (filaments also holds
  strip/vertex counts that are **unread** from the store — they reach React via
  `cb.filaments.onReady`, not the getters). The slot's `ready` already is that
  bit. Pure ceremony. **Delete.**
- **structures** → holds a *transformation* the slot can't give you: the
  `structureCatalog` slot's `current()` is the raw payload; the store turns it
  into `StructureRecord[]`, **merges** two sources (curated anchor seed + bulk
  catalog), and **indexes** it (`byId`, `byCategory`, fixed `all()` order the
  ring pick-index decode depends on). **Keep.**
- **galaxies** → the data is a mirror (its own docstring says "CPU-side mirror";
  `setCatalog`'s only caller is the points-slot commit), kept for read
  ergonomics + `famousMeta` unification across a second slot. Borderline; a
  larger, separate consolidation candidate (see Deferred).

## Design (approach B — a shared predicate)

### The predicate

A single-function file `src/services/loading/slotReady.ts`:

```ts
import type { AssetSlot } from '../../@types/loading/AssetSlot';

/**
 * True once a slot has committed its value to its renderer/consumer
 * (LoadState 'ready'). The single reading of "loaded = the slot committed";
 * the `null` arm absorbs the pre-wireSlots window when the slot isn't minted
 * yet (the slot field is `| null` until `wireSlots`).
 */
export function slotReady<T, Req>(slot: AssetSlot<T, Req> | null): boolean {
  return slot != null && slot.state().kind === 'ready';
}
```

Generic so it types at each call. One home for the "ready === committed-to-
renderer" semantic.

### Changes

1. **Add** `slotReady` + its test.
2. **Repoint the 4 flow readers** of `state.data.flow.loaded` →
   `slotReady(state.assetSlots.flow)`:
   - `src/services/engine/engine.ts` (the flow re-enable drive-guard, ~line 1260)
   - `src/services/engine/frame/encodeHdrSingle.ts` (~line 72)
   - `src/services/engine/frame/encodeHdrSplit.ts` (~line 81)
   - `src/services/engine/frame/passes/flowFieldPass.ts` (~line 39)
   - **Caveat:** each reader's state slice must include `assetSlots`. If a helper
     takes a narrowed `Pick<EngineState, …>` that only has `data`, widen it to
     add `assetSlots`. `tsc` flags any miss; `engine.ts` has the full `state`.
3. **Delete the mirror writes:**
   - `flowFieldSlot.ts` — drop `state.data.flow.setLoaded()` (the slot's own
     `ready` is the truth).
   - `filamentSlot.ts` — drop `state.data.filaments.setLoaded(...)`. **Keep**
     `cb.filaments?.onReady?.(...)` — that's how counts reach React; the store
     getters were never read.
4. **Delete the stores + their types + tests:**
   - `src/services/engine/data/createFlowFieldStore.ts`
   - `src/services/engine/data/createFilamentStore.ts`
   - `src/@types/engine/data/FlowFieldStore.d.ts`
   - `src/@types/engine/data/FilamentStore.d.ts`
   - their `*.test.ts`
5. **Remove `flow` and `filaments` from `EngineData`:**
   - `src/@types/engine/data/EngineData.d.ts` — drop both fields (and their
     imports); `EngineData` is left with `galaxies` + `structures`.
   - `src/services/engine/data/createEngineData.ts` — drop both constructions
     (and imports). Update the docblock (it currently explains the flow
     status-only store).

No behaviour change: the "is flow loaded" fact moves from 3 homes to 1 (the
slot). Removing the `EngineData` fields turns any stray reader into a compile
error — the safety net.

## Verification

- `npm run typecheck` clean (catches every missed reader / widened slice).
- `npm test` green (existing flow/filament tests still pass; deleted store tests
  removed with their stores).
- Re-run the entanglement-radar lens on the diff: confirm no new mirror, the
  predicate is the single reading idiom, and `data` now holds only real data
  (galaxies/structures), not status.

## Out of scope / deferred

- **Galaxies-store consolidation** — the largest mirror, deliberately left for a
  separate decision. Two honest options when picked up:
  1. *Slot-backed facade* — keep the `GalaxyStore` read API (`get` / `catalogs`
     / `famousMeta`) but back it by the slots (no own `Map`, no `setCatalog`/
     `removeCatalog`), so the slot is the sole home. ~26 readers unchanged; only
     the store internals + commit writers change.
  2. *Full repoint* — delete the store, repoint all ~26 readers to
     `assetSlots.points.get(src)?.current()` + `assetSlots.famousMeta`. Maximal,
     but couples many frame helpers to the slot API.
  Structures stays regardless (it's a transform/index, not a mirror).
- **Braid #2 (fade-ownership + renderer mirrors)** — `flowFieldRenderer.hasField`
  (an internal mirror of `field !== null`), `selectionRingRenderer.currentSelection`,
  the `scalarVolumeRenderer → fade registry` callback inversion, and deleting the
  flow re-enable drive-guard entirely (once the fade manifest seeds the `flow`
  handle at construction). These ride the fade redesign, which unblocks the #38
  visibility seam and #39 tour.
