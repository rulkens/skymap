# Fade ownership + visibility seam (merged) — design

**Status:** designed, awaiting plans. Merges braid #2 with the #38 visibility
seam so the fade manifest has exactly **one home**.

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
already ~80% the manifest: it iterates `STRUCTURE_CATEGORIES`, seeds each handle
from `state.settings`, and documents the frame-1 coherence rationale. The four
**out-of-band** registration sites are the holdouts:

- `galaxyCatalogSourceRegistry.ts` — `survey` handle per source, in the slot factory.
- `filamentSlot.ts` — `filaments`, in the slot factory.
- `flowFieldSlot.ts` — `flow`, in the slot factory.
- `initGpu.ts` — `scalarField` handles, via the renderer callback
  `scalarVolumeRenderer.onFieldAdded/onFieldRemoved` (an inversion: a renderer
  mutating the fade registry).

### The seed asymmetry is essential, not accidental (radar finding)

The braid #2 spec claimed *"seed opacity is settings-derived for every layer."*
The code says otherwise, and the difference is load-bearing:

- `registerOverlayFades` seeds overlays / volumesMaster / markers / structure
  labels from **settings** (so a default-off layer sits at 0 on frame 1).
- The four demand-loaded layers register at **0** and fade in from their **slot
  commit** once content lands (`flowFieldSlot.ts:34` → `register(flow, 0)`, then
  the commit fires `fadeTo(1)`).

If a manifest naively seeded the demand-loaded layers at `settings ? 1 : 0`, the
first-load fade-in would be lost — a `fadeTo(1)` from 1 is a no-op. So the seed
rule is genuinely **multi-valued**, and that variation belongs in the manifest as
data (one `seed()` closure per row), not flattened into a single rule:

| Discipline | Layers | seed |
|---|---|---|
| always-on overlay | proceduralDisks, texturedDisks | `1` |
| producer-driven | youAreHere | `0` (fades in on first emit) |
| reused-by-producer | galaxyNames | `1` (famous labels consume it directly) |
| react-side, tour-addressable | scaleBar | `1` |
| intent toggle, resident content | milkyWay, volumesMaster, markerLayer, structure labelLayer | `settings-derived` |
| intent toggle, **demand-loaded** | survey, filaments, flow, scalarField | `0` (commit fades in toward intent) |

## The two overlapping sets (why one table works)

- **Registration set** — *all* fade handles need registering + seeding at
  construction (braid #2's job).
- **Intent set** — the toggle subset (survey, survey-label, structure ring,
  structure label, volume field, volumesMaster, filaments, milkyWay, flow) also
  needs intent read/write for #38 capture/restore. The producer-driven and
  always-on handles (youAreHere, galaxyNames, scaleBar, disks) are
  registration-only — the *essential* fades the spec says not to flatten.

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
  expand(state: EngineState): readonly Item[];      // singleton | per SurveyId | per Cat | per Field
  handle(item: Item): FadeHandle;
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
now-static `scalarField` set, enumerated from the volume registry — seeds at t=0.
Result: registration has exactly one home; the slot factories and `initGpu` no
longer call `register`; `scalarVolumeRenderer` drops the
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
    'surveys' | 'structures' | 'volumes' | 'filaments' | 'milkyWay' | 'flow'>
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

- `scalarVolumeRenderer.onFieldAdded/onFieldRemoved` → **deleted** (manifest seeds
  the scalarField set at construction).
- `flowFieldRenderer.hasField` → read `field !== null`.
- `selectionRingRenderer.currentSelection` → passed in per frame from
  `state.subsystems.selection`.

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
| **Braid #1** (separate spec, ready) | `slotReady` predicate; delete the 2 status-only stores; repoint the flow re-enable guard to `slotReady` | — (ship first) |
| **Plan C** — renderer mirrors | `flowFieldRenderer.hasField` → `field !== null`; `selectionRingRenderer.currentSelection` → per-frame input | independent, anytime |
| **Plan A** — manifest seed | `FADE_LAYERS` + `seedFades`; absorb `registerOverlayFades` + the 4 out-of-band sites; delete the scalarVolume callback | — |
| **Plan B** — intent bridge + #38 seam | `syncVisibilityFades`/`applyIntent`; `captureSettings`/`restoreSettings`/`applyEffect` + `SettingsSnapshot`; repoint the ~10 drivers + slot-commit fade-ins through the bridge; **delete** the drive-guards | A (+ braid #1: the guard braid #1 repoints is the one B deletes) |

**Two sequencing calls baked in:**

- **(a)** Slot-commit fade-ins route through `syncVisibilityFades(only:[key])`
  rather than hand-coding the `fadeTo`. The consolidation is the point (one intent
  mapping, guard included); the cost is that slot commits now depend on the
  manifest — acceptable, since the manifest is constructed before any commit fires.
- **(b)** Braid #1 lands **before** Plan B so the flow re-enable guard is deleted
  (B) rather than just repointed-and-kept. Braid #1 repoints it to `slotReady`; B
  removes it once every handle seeds at construction and `fadeTo` can no longer hit
  an unregistered handle.

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
- **No** change to producer-driven (youAreHere / galaxyNames / structure labels'
  first-emit) or focus-recession fades — both essential, both untouched.
