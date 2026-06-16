# Fade ownership + visibility seam (merged) — design

**Status:** designed, awaiting plans. Re-grounded 2026-06-16 against the tree after
the Milky-Way-first-class effort (#312/#313/#317/#318) and braid #1 (#309) landed.
Merges braid #2 with the #38 visibility seam so the fade manifest has exactly
**one home**.

> **Re-grounding deltas (2026-06-16) — what changed under the spec since 2026-06-15:**
> - `FadeHandle` → **`FadeId`** (#317); `STRUCTURE_CATEGORIES` → **`STRUCTURE_IDS`**
>   (#317); the `surveys` settings cluster → **`galaxyCatalogs`** (#312); the
>   `scalarVolumeRenderer` → **`volumeFieldRenderer`**. Applied throughout below.
> - The **`youAreHere` fade layer is gone** (#313 folded it into `labelLayer:milkyWay`).
>   Its discipline ("producer-driven, seed `0`") had no other member, so that row is
>   **deleted** — a net simplification, not an open question.
> - The **Milky Way is now two intent rows** (disk `{kind:'milkyWay'}` +
>   `{kind:'labelLayer', layer:'milkyWay'}`), both settings-derived, parallel to how
>   structures carry a marker row + a label row (#318 made the disk a first-class
>   toggle).
> - **Braid #1 shipped** (#309): the flow re-enable guard is already repointed to
>   `slotReady(assetSlots.flow)`; Plan B's job narrows to *deleting* it.

**Supersedes the standalone framing of:**

- `2026-06-14-fade-ownership-design.md` (braid #2) — its four open decisions are
  resolved here.
- `2026-06-10-visibility-seam-reconciled-design.md` (#38) — its `VISIBILITY_LAYERS`
  registry and `syncVisibilityFades`/`captureSettings`/`restoreSettings` are the
  intent-bearing subset of the manifest defined here; that doc stays the detailed
  reference for **Plan B**.

Braid #1 (`2026-06-14-load-state-consolidation-design.md`) is an independent
prerequisite — see Sequencing.

## Goal

The fade subsystem owns the *whole* fade concern. Every fade layer is declared in
**one** manifest (its existence + a settings-derived-or-zero seed opacity), every
intent change goes through **one** bridge, and renderers stop holding fade-adjacent
state or reaching into the fade registry. The same manifest is the
`VISIBILITY_LAYERS` registry the #38 snapshot/restore seam consumes — the registry
the #39 cinematic tour depends on.

## What grounding the code changed about the design

`registerOverlayFades` (`src/services/engine/wiring/registerOverlayFades.ts`) is
already ~80% the manifest: it iterates `STRUCTURE_IDS`, seeds each handle
from `state.settings`, and documents the frame-1 coherence rationale. The four
**out-of-band** registration sites are the holdouts:

- `galaxyCatalogSourceRegistry.ts` — `{kind:'galaxyCatalog'}` handle per source, in
  the slot factory (`register(…, 0)`, line ~154).
- `filamentSlot.ts` — `{kind:'filament'}`, in the slot factory (line ~30).
- `flowFieldSlot.ts` — `{kind:'flow'}`, in the slot factory (line ~36).
- `initGpu.ts` — `{kind:'volumeField'}` handles, via the renderer callback
  `volumeFieldRenderer.onFieldAdded/onFieldRemoved` (an inversion: a renderer
  mutating the fade registry).

### The seed asymmetry is essential, not accidental (radar finding)

The braid #2 spec claimed *"seed opacity is settings-derived for every layer."*
The code says otherwise, and the difference is load-bearing:

- `registerOverlayFades` seeds disks / volumesMaster / markers / Milky-Way + structure
  labels from **settings** (so a default-off layer sits at 0 on frame 1). The
  producer-driven labels (Milky-Way label, structure labels) seed **settings-derived
  too** — their producer's first-emit `fadeTo(1)` is a coherence *re-assertion*, not
  the source of initial visibility (`registerOverlayFades.ts:95–117`).
- The four demand-loaded layers register at **0** and fade in from their **slot
  commit** once content lands (`flowFieldSlot.ts:36` → `register({kind:'flow'}, 0)`,
  then the commit fires `fadeTo(1)`).

If a manifest naively seeded the demand-loaded layers at `settings ? 1 : 0`, the
first-load fade-in would be lost — a `fadeTo(1)` from 1 is a no-op. So the seed
rule is genuinely **multi-valued**, and that variation belongs in the manifest as
data (one `seed()` closure per row), not flattened into a single rule. The seed
disciplines, after #313 removed the lone seed-`0`-producer-driven layer
(`youAreHere`):

| Discipline | Layers | seed |
|---|---|---|
| always-on overlay | proceduralDisks, texturedDisks | `1` |
| reused-by-producer | galaxyNames | `1` (famous labels consume it directly) |
| react-side, tour-addressable | scaleBar | `1` |
| intent toggle, resident content | milkyWay disk, milkyWay label, volumesMaster, markerLayer (per structure), structure labelLayer (per structure) | `settings-derived` |
| intent toggle, **demand-loaded** | galaxyCatalog, filament, flow, volumeField | `0` (commit fades in toward intent) |

Note the vocabulary: the **`FadeId` kinds** are `galaxyCatalog` / `filament` (singular)
/ `flow` / `volumeField`; the manifest's row keys (`VisibilityLayerKey`, below) may use
friendlier names (`survey` / `filaments`), but `handle()` must emit the real `FadeId`
kinds. Pick one vocabulary for the row keys when Plan A lands and keep `handle()` as the
sole translation point.

## The two overlapping sets (why one table works)

- **Registration set** — *all* fade handles need registering + seeding at
  construction (braid #2's job).
- **Intent set** — the toggle subset (survey, survey-label, structure ring,
  structure label, volume field, volumesMaster, filaments, milkyWay **disk**,
  milkyWay **label**, flow) also needs intent read/write for #38 capture/restore.
  The reused-by-producer and always-on handles (galaxyNames, scaleBar, disks) are
  registration-only — the *essential* fades the spec says not to flatten. (Milky Way
  now contributes two intent rows: `milkyWay.enabled` → disk, `milkyWay.labelEnabled`
  → label, mirroring a structure's ring + label pair.)

The intent set is a **subset** of the registration set, so one table serves both:
intent-bearing rows carry an `intent`/`writeIntent`; the rest don't.

## Design

### 1. The manifest — `FADE_LAYERS`

A single declarative table of closure rows in
`src/services/engine/wiring/fadeLayers.ts`, **absorbing** `registerOverlayFades`
and the four out-of-band sites.

```ts
// src/@types/animation/FadeLayer.d.ts  (one type per file)
export type FadeLayer<Item> = {
  readonly key: VisibilityLayerKey;                 // 'survey' | 'structureRing' | …
  expand(state: EngineState): readonly Item[];      // singleton | per GalaxyCatalogId | per StructureId | per VolumeFieldId
  handle(item: Item): FadeId;                        // the sole VisibilityLayerKey → FadeId-kind translation point
  seed(settings: EngineSettingsState, item: Item): number;  // settings-derived OR 0 (demand-loaded)
  // intent rows only (the #38 subset):
  intent?(settings: EngineSettingsState, item: Item): boolean;
  writeIntent?(settings: EngineSettingsState, item: Item, value: boolean): void;
  post?(state: EngineState, item: Item): void;      // deriveSourceMasks / maybeLazyLoadDebugVolume
  guard?(state: EngineState, item: Item): boolean;  // flow: only fade once loaded
};
```

`seedFades(state)` iterates every row, expands it, and `register`s each handle at
its `seed()`. Because the FadeRegistry is built eagerly before any renderer and
seeding is a pure opacity write (no GPU dependency), every handle — including the
now-static `volumeField` set, enumerated from the volume registry — seeds at t=0.
Result: registration has exactly one home; the slot factories and `initGpu` no
longer call `register`; `volumeFieldRenderer` drops the
`onFieldAdded/onFieldRemoved` callbacks.

### 2. The intent bridge — one function, not push-vs-pull

Push and pull are the same per-row operation with a filter, so they collapse to
one public function over a private per-row op:

```ts
// private: read intent → fade/cut → post-hook, respecting guard
applyIntent(state, row, item, { animate }): void

// public bridge (= #38's syncVisibilityFades):
syncVisibilityFades(
  state: Pick<EngineState, 'settings' | 'subsystems' | 'data'>,
  opts: { animate: boolean; only?: readonly VisibilityLayerKey[] },
): void
```

- `animate: true` → `fades.fadeTo(handle, target, dur)` (the cross-fade; `fadeTo`
  owns the render wake per #300).
- `animate: false` → `fades.setImmediate(handle, target)`, then **one**
  `scheduler.requestRender()` after the batch (setImmediate deliberately does not
  wake).

Three callers, one mapping:

- **Checkbox toggle (push):** write the intent boolean (via the row's `writeIntent`
  where needed, e.g. the volume copy-on-write) → `syncVisibilityFades(state,
  {animate:true, only:[key]})` → React echo. The setters keep their signatures and
  echoes; only the intent↔handle dispatch moves into the shared bridge.
- **Tour restore (pull):** deep-assign the snapshot → `syncVisibilityFades(state,
  {animate})` over all rows.
- **Slot-commit first-load fade-in:** after `upload`, the commit calls
  `syncVisibilityFades(state, {animate:true, only:[key]})`. This **dissolves** the
  hand-coded `if (settings.X.enabled) fadeTo(1)` in each slot *and* the engine.ts
  drive-guards: the flow row's `guard(state)` (= "only fade once loaded") lives in
  the table and both the toggle path and the commit path respect it.

`syncVisibilityFades` does fades only — never settings writes, never React echoes.

### 3. The snapshot seam (#38)

Unchanged from the reconciled #38 spec, now built on the manifest above:

```ts
// src/@types/engine/settings/SettingsSnapshot.d.ts
export type SettingsSnapshot = Readonly<
  Pick<EngineSettingsState,
    'galaxyCatalogs' | 'structures' | 'volumes' | 'filaments' | 'milkyWay' | 'flow'>
>;
```

- `captureSettings(state)` — `structuredClone` of those six clusters (detached;
  whole clusters so look-knobs ride along; zero translation layer).
- `restoreSettings(state, snapshot, { animate }, cb?)` — deep-assign clusters back,
  then `syncVisibilityFades(state, { animate })`; optional React echo.
- `applyEffect(state, patch, { animate })` — partial variant for one scene:
  deep-assign `patch`, then `syncVisibilityFades(state, { animate, only:<touched> })`.

Demand re-evaluates next frame from the restored intent (#298) — no demand changes.

### 4. Renderers shed fade-adjacent state

- `volumeFieldRenderer.onFieldAdded/onFieldRemoved` → **deleted** (manifest seeds
  the `volumeField` set at construction).
- `flowFieldRenderer.hasField` → this is already a **private closure flag**, and it
  mirrors **load-state**, not fade. Post-braid-#1 the `enabled()` gate should read
  `slotReady(state.assetSlots.flow)` instead of a local `hasField`, deleting the
  mirror. (Re-scoped: the spec's original "→ `field !== null`" predates braid #1's
  `slotReady` predicate, which is the cleaner source.)
- `selectionRingRenderer.currentSelection` → already a private closure set via
  `setSelection(value)`. The push→pull move (read per frame from
  `state.subsystems.selection`) still stands, but re-ground it against the
  **post-#318 selection flow**: selection is now a tagged `FocusableTarget`, and
  `selectionRingPass` derives `{worldPos, ringRadiusPx}` via `SELECTION_HALO[type]`
  before calling the renderer. Plan C threads that pass's per-frame value in rather
  than calling `setSelection`.

### 5. `fadeTo` throw — kept

Once every handle seeds at construction the throw never fires for the static set —
which is the goal, not a reason to remove it. It stays as a cheap programmer-error
guard for future/typo'd handles. The documented asymmetry — draw-loop `opacityOf`
fails safe to 1.0, explicit `fadeTo` fails loud — is intentional. **The
fadeRegistry core is untouched**, keeping blast radius minimal.

## Resolved open decisions (from braid #2)

1. **Manifest shape** → one declarative table of closure rows (intent fields
   optional). The heterogeneity (static / per-category / per-source / per-field;
   settings-seed vs zero-seed) lives in per-row closures, so the table stays data
   and the seed/intent loops stay generic.
2. **Intent API surface** → one `syncVisibilityFades(state, { animate, only? })`
   over a private per-row `applyIntent`. Push = write settings + sync(only:[key]);
   pull = deep-assign + sync(all). No separate `setVisible`.
3. **`fadeTo` throw vs fail-safe** → keep the throw; leave the fadeRegistry core
   untouched.
4. **Plan decomposition** → four landable units (below).

## Plan decomposition + sequencing

Each unit is behaviour-preserving with its own tests; green before and after is the
gate.

| Plan | Scope | Depends on |
|---|---|---|
| **Braid #1** ✅ **SHIPPED (#309)** | `slotReady` predicate; deleted the 2 status-only stores; repointed the flow re-enable guard to `slotReady` | done |
| **Plan C** — renderer mirrors | `flowFieldRenderer.hasField` → `slotReady(assetSlots.flow)` (braid #1's predicate); `selectionRingRenderer.currentSelection` → per-frame input from `selectionRingPass`'s `SELECTION_HALO`-derived value (post-#318) | independent, anytime |
| **Plan A** — manifest seed | `FADE_LAYERS` + `seedFades`; absorb `registerOverlayFades` + the 4 out-of-band sites; delete the scalarVolume callback | — |
| **Plan B** — intent bridge + #38 seam | `syncVisibilityFades`/`applyIntent`; `captureSettings`/`restoreSettings`/`applyEffect` + `SettingsSnapshot`; repoint the ~10 drivers + slot-commit fade-ins through the bridge; **delete** the flow drive-guard braid #1 already repointed to `slotReady` (`engine.ts:~1228`) | A (braid #1 is shipped) |

**Two sequencing calls baked in:**

- **(a)** Slot-commit fade-ins route through `syncVisibilityFades(only:[key])`
  rather than hand-coding the `fadeTo`. The consolidation is the point (one intent
  mapping, guard included); the cost is that slot commits now depend on the
  manifest — acceptable, since the manifest is constructed before any commit fires.
- **(b)** Braid #1 has **already shipped** (#309), repointing the flow re-enable
  guard to `slotReady`. Plan B's remaining job is to *delete* that guard once every
  handle seeds at construction and `fadeTo` can no longer hit an unregistered handle
  — the guard becomes dead weight, not a correctness requirement.

Then #39 cinematic tour wires `snapshot`/`restore`/`applyEffect` onto
`captureSettings`/`restoreSettings`/`applyEffect`.

## Verification (per plan)

- `npm run typecheck` + `npm test` green after each plan.
- Visual smoke: every toggle still fades; no frame-1 flash (seed coherence); tier
  swaps still fade-out→upload→fade-in; producer/focus fades unchanged.
- Re-run `entanglement-radar` on each diff: registration has one home, intent→fade
  has one home, no renderer mutates the fade registry, no new mirror, the seed
  asymmetry is data not prose.
- Plan B round-trip (the #38 acceptance test): `captureSettings` → mutate via
  `restoreSettings`/`applyEffect` → `restoreSettings(original)` → `captureSettings`
  deep-equals the first snapshot.

## Scope guards (non-goals)

- **No** mask→registry migration; `drawMask`/`pickMask` stay derived.
- **No** `sources.tier` into settings, **no** `tonemap`/`bias`/`camera`/
  `thumbnails`/`debug` in the snapshot.
- **No** new fade-handle `kind`s — the manifest reuses the handles producers
  already read.
- **No** change to producer-driven first-emit fades (galaxyNames / Milky-Way label /
  structure labels) or focus-recession fades — both essential, both untouched.
