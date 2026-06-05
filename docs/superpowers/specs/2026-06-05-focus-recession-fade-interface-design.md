# Focus recession — a consistent fade interface for ambient layers

**Date:** 2026-06-05
**Status:** Design approved, awaiting spec review

## Problem

When the user focuses a structure (cluster / group / supercluster / void), the
ambient layers around it should recede so the focused thing stands out. Today
this is done — where it's done at all — inconsistently, and that inconsistency
is the real target of this work:

| Layer | Focus-recession today | Mechanism |
| --- | --- | --- |
| Galaxy points | Smooth, per-vertex member isolation | `focusAlphaMultiplier` in the points shader, driven by `FocusUniforms.blend` |
| POI markers (rings/halos) | **Hard binary snap** to `NON_SELECTED_MARKER_DIM` the instant a POI is focused | CPU bake in `produceStructureMarkers.ts:110` |
| POI labels | None | — |
| Filaments | None | — |
| Volumes (MCPM / rhizome) | None | — |

Three datasets, three different fade-out stories. The immediate asks —
*other POI markers fade out more*, *filaments / MCPM fade out too* — are the
forcing function to replace these one-offs with **one consistent interface**.

## Goal

Every ambient layer recedes on structure focus through the **same composable
opacity model**, driven by a **single source of truth** for "how focused are
we." Adding a future layer to the recession behaviour should be a one-line
declarative change, not bespoke per-layer code.

Out of scope: changing the galaxy-points member-isolation effect (it already
works and is orthogonal — it isolates *members of the focused structure*, a
per-vertex spatial test, not an ambient-layer recession).

## The composable opacity model

A fade handle's opacity stops being a single scalar and becomes a **product of
independent sources**:

```
opacityOf(handle) = toggleFade(handle) × focusRecession(handle)
```

- **`toggleFade`** — the existing `FadeController`-animated scalar a handle
  already owns (layer on/off, tier swap, load-in). Unchanged. Default 1.0 for
  handles with no controller (the existing fail-safe).
- **`focusRecession`** — `1.0` for handles not tagged ambient; otherwise
  `mix(1.0, RECESSION_TARGET, focusBlend)`.

`focusBlend` is the **same 0→1 blend `clusterFocusSubsystem` already produces**
when a structure is focused (it already ramps over ~400 ms and already gates
render-on-demand via `clusterFocus.isAwake()`). Nothing new computes "how
focused are we."

Keeping these two sources orthogonal is what makes "unify through the
FadeRegistry" actually work: focus recession multiplies *on top of* the user's
enable/disable toggle fade instead of clobbering it. A layer the user has
faded out (toggle 0) stays out (0 × anything = 0); a layer at half its
toggle fade recedes from there.

## The recession table — the entire "consistent interface"

Ambient membership is declared in one static table in `fadeRegistry.ts`, keyed
by the **serialized handle string** (so a specific label layer can recede while
its siblings don't):

```ts
// Serialized-handle → recession target. Absent ⇒ no recession (factor 1.0).
const RECESSION_TARGETS: Record<string, number> = {
  'filaments': /* tune */,
  'volumesMaster': /* tune */,
  'markerLayer': /* = today's NON_SELECTED_MARKER_DIM, or deeper */,
  'labelLayer:POI': /* tune, matches markerLayer */,
};
```

Per-layer targets (approved): markers/labels dim moderately; the large diffuse
filament / volume fields recede harder. All four are tuned live on the dev
server. Adding a new ambient layer later = one line here.

Why serialized-string keys, not `kind`: `volumesMaster` and `filaments` are
kind-only, but labels recede *selectively* — `labelLayer:POI` recedes while
`labelLayer:you-are-here` and the scale bar do not. The existing
`serializeFadeHandle` already produces exactly the right granularity.

## Registry API changes (small, additive)

In `src/services/animation/fadeRegistry.ts` / `FadeRegistry.d.ts`:

1. **`setFocusBlend(blend: number): void`** — stores the current focus blend
   (default 0). Called once per frame from `runFrame`, right next to the
   existing `clusterFocus.update()`.

2. **`opacityOf` composes recession** — after resolving the toggle scalar
   (controller `currentOpacity`, or the 1.0 fail-safe), multiply by
   `mix(1, RECESSION_TARGETS[key] ?? 1, focusBlend)`. Returns the toggle
   unchanged for non-ambient handles, so every existing caller is unaffected
   except the four ambient ones — which is the intended behaviour change.

3. **`FadeHandle` gains `{ kind: 'markerLayer' }`** — POI markers have no fade
   handle today. The new kind exists so markers read recession through the same
   `opacityOf` call as everyone else. No controller is required (markers have no
   toggle fade); the 1.0 fail-safe leaves `opacityOf` returning pure recession.
   `serializeFadeHandle` gets the `'markerLayer'` case. Registered at opacity
   1.0 at marker-renderer construction for symmetry with the other layers.

`isAnyAnimating` is **not** touched — the recession ramp is owned by
`clusterFocus`, whose `isAwake()` is already in the render-on-demand predicate,
so frames keep ticking through the 400 ms ramp in both directions.

## Per-layer application

**Whole-layer (no pass changes — they already call `opacityOf`):**

- **Filaments** — `filamentsPass` already multiplies
  `opacityOf({ kind: 'filaments' })`. Table entry → it recedes. "Whichever
  shown" is automatic: when off, opacity is already 0.
- **Volumes** — `volumeUpsamplePass` already reads `volumesMaster`, which is
  multiplied into every scalar field at the call site. Table entry on
  `volumesMaster` → the whole volume subsystem recedes with one line,
  regardless of active tier/field.

**Per-instance (read the layer recession, exempt the focused instance):**

- **POI markers** — in `produceStructureMarkers.ts`, replace the binary
  `dim = focusedPoiId !== null && p.id !== focusedPoiId ? NON_SELECTED_MARKER_DIM : 1`
  with the smooth layer recession:

  ```ts
  const recession = fades.opacityOf({ kind: 'markerLayer' }, now);
  const dim = p.id === focusedPoiId ? 1 : recession;
  ```

  When nothing is focused, `focusedPoiId` is null and `focusBlend` is 0, so
  `recession` is 1 and every marker is unaffected — same at-rest behaviour, now
  animated on the way in/out. The selected-ring ×1.5 bump stays as-is.
  `NON_SELECTED_MARKER_DIM` migrates from `structurePoiStyles` into the
  recession table as the `markerLayer` target (and the standalone constant is
  removed).

- **POI labels** — the label director applies the `labelLayer:POI` layer
  opacity per frame; if it reads it through `opacityOf` (confirm during
  planning), the table entry makes that opacity recede with no further change.
  The director additionally exempts the **focused structure's**
  label (full strength) the same way markers exempt the focused ring, so a
  faded ring never carries a bright label. (Galaxy-name labels and other label
  layers are *not* tagged — out of scope here.)

## Scope decisions (locked)

- **Trigger:** any structure focus — cluster, group, supercluster, void —
  because recession rides the focus blend, which already ramps for all of them.
  No per-category special-casing.
- **Labels recede with their markers** (per-instance, focused one exempt).
- **Per-layer recession targets**, all tuned visually on the dev server.
- Galaxy points keep their existing member-isolation effect, untouched.

## Data flow

```
selection.focused()  ─▶  clusterFocus.update(focusedPoi)  ─▶  blend (0→1, ~400ms)
                                                                 │
                                            runFrame: fades.setFocusBlend(blend)
                                                                 │
                       ┌─────────────────────────────────────────┼───────────────────────────┐
                       ▼                     ▼                     ▼                            ▼
        opacityOf(filaments)   opacityOf(volumesMaster)   opacityOf(markerLayer)   opacityOf(labelLayer:POI)
         = toggle × recession    = toggle × recession        = 1 × recession          = toggle × recession
                       │                     │                     │                            │
              filamentsPass        volumeUpsamplePass      produceStructureMarkers        labelDirector
                                                          (exempt focused ring)        (exempt focused label)
```

## Edge cases (all fall out for free)

- **Unfocus** → blend ramps to 0 → recession → 1.0. No reverse logic.
- **Focus a galaxy** (not a structure) → `focusedPoi` is null → blend 0 →
  nothing recedes.
- **Layer toggled off** → toggle 0 → 0 × recession = 0.
- **Render-on-demand** → covered by the existing `clusterFocus.isAwake()`.

## Testing (TDD)

- **`fadeRegistry` composition** — pure and the core of the change:
  - `opacityOf` = toggle × recession for ambient handles; unchanged (= toggle)
    for non-ambient handles.
  - `blend = 0` → identity; `blend = 1` → exactly the table target;
    intermediate → the lerp.
  - `setFocusBlend` re-composes subsequent `opacityOf` reads.
  - `markerLayer` with no controller returns pure recession (1.0 fail-safe ×
    recession).
- **`produceStructureMarkers`** — non-focused marker alpha scales by recession
  when `blend > 0`; the focused marker and the selected-bump path are
  unaffected; at-rest (`blend = 0`) output is byte-identical to today.
- **Label director** — focused structure's POI label exempt from recession;
  siblings recede.
- **Filaments / volumes** — no new test; they already multiply `opacityOf`, so
  the registry composition test covers them.

## Files touched (anticipated)

- `src/@types/animation/FadeHandle.d.ts` — add `markerLayer` kind + docblock.
- `src/@types/animation/FadeRegistry.d.ts` — `setFocusBlend` signature.
- `src/services/animation/fadeRegistry.ts` — `RECESSION_TARGETS`,
  `setFocusBlend`, recession in `opacityOf`, `markerLayer` serialization.
- `src/services/engine/frame/runFrame.ts` — `fades.setFocusBlend(blend)`.
- `src/services/engine/presentation/produceStructureMarkers.ts` — smooth
  recession, drop the binary dim.
- `src/services/engine/presentation/structurePoiStyles.ts` — remove
  `NON_SELECTED_MARKER_DIM` (migrated into the table).
- Label director + its marker-layer registration (locate during planning).
- `tests/` mirrors for `fadeRegistry`, `produceStructureMarkers`, label director.
```
