# Focus recession — a consistent fade interface for every layer

**Date:** 2026-06-05
**Status:** Design approved, awaiting spec review

## Problem

When the user focuses a structure (cluster / group / supercluster / void), the
ambient layers around it should recede so the focused thing stands out. The
literal asks were: *other POI markers fade out more*, *filaments / MCPM fade out
too*, *famous-galaxy labels recede too*.

But the real target is the **inconsistency these asks expose**: every layer does
its fade-out differently, and some don't participate in the fade system at all.

| Layer | Focus-recession today | On/off today | Reads `opacityOf`? |
| --- | --- | --- | --- |
| Galaxy points | Smooth, per-vertex member isolation (`focusAlphaMultiplier`) | Per-source fade | Yes (GPU uniform) |
| Filaments | None | Fade | Yes (GPU uniform) |
| Volumes (MCPM / rhizome) | None | Fade (`volumesMaster`) | Yes (GPU uniform) |
| POI markers (rings/halos) | **Hard binary snap** to `NON_SELECTED_MARKER_DIM` | **Instant boolean skip** (`markerVisible`) — *pops* | No (CPU-baked alpha) |
| POI labels | None | **Instant boolean skip** (`labelVisible`) — *pops* | **No** — handle registered but **renderer ignores the opacity** |
| Famous-galaxy labels | None | Boolean | **No** — same label path |

Two facts uncovered while grounding this design (and worth stating plainly,
because the first draft of this spec got them wrong):

- **The label subsystem does not consume fade opacity at all.** `labelLayer:poi`
  is registered and even gets `fadeTo(1)` fired, but `labelsPass` renders with no
  opacity input — the value is computed and discarded. Making *any* label fade
  (toggle *or* recede) requires first wiring the label path to read `opacityOf`.
- **The `galaxyNames` label layer is unbuilt.** The galaxy names visible today
  are the **famous-galaxy labels** (`produceFamousLabels`); the dedicated
  per-galaxy layer is reserved. "Galaxy name labels" in this spec means the
  famous labels.

## Goal — one principle

> **Every layer's final opacity comes from `fades.opacityOf(handle)`, and that
> value already folds in both the user's on/off fade and the focus recession.**

Concretely:

```
opacityOf(handle) = toggleFade(handle) × focusRecession(handle)
```

A layer never computes "am I focused-out?" or "is my category off?" on its own
anymore — it asks the registry for one number. Adding a new layer to the
recession behaviour is one branch in one function. Removing the marker/label
"pop" falls out of routing their category on/off through the same fade.

Out of scope: the galaxy-points member-isolation effect stays as-is. It isolates
*members of the focused structure* (a per-vertex spatial test), which is a
different thing from ambient recession and already works.

## The composable opacity model

A fade handle's opacity stops being a single scalar and becomes a **product of
two independent sources**:

- **`toggleFade`** — the existing `FadeController`-animated scalar the handle
  owns (load-in, tier swap, and — newly — category on/off). Default 1.0 for
  handles with no controller (the existing fail-safe).
- **`focusRecession`** — `1.0` unless the handle is recession-tagged, in which
  case `mix(1.0, RECESSION_TARGET, focusBlend)`.

`focusBlend` is the **same 0→1 value `clusterFocusSubsystem` already produces** —
`FocusUniformsValue.blend`, `clusterFocusSubsystem.ts:106`, surfaced into the
frame at `runFrame.ts:296`. It ramps over ~400 ms and already gates
render-on-demand via `clusterFocus.isAwake()`. Nothing new computes "how focused
are we."

Keeping the two sources orthogonal is what makes unifying through the registry
correct: recession multiplies *on top of* the toggle fade instead of clobbering
it. A layer toggled off (0) stays off (`0 × anything = 0`); a half-faded layer
recedes from where it is.

## Recession membership — one exhaustive function

Recession is *selective* (e.g. POI labels recede, the YOU-ARE-HERE pin and scale
bar must not), so membership is an exhaustive switch over the `FadeHandle` union,
mirroring `serializeFadeHandle` in the same file:

```ts
// undefined ⇒ not recession-tagged (factor 1.0).
function recessionTargetFor(h: FadeHandle): number | undefined {
  switch (h.kind) {
    case 'filaments':     return FILAMENT_RECESSION;
    case 'volumesMaster': return VOLUME_RECESSION;
    case 'markerLayer':   return MARKER_RECESSION;   // all categories
    case 'labelLayer':
      // structure labels + famous-galaxy labels recede; the YOU-ARE-HERE pin
      // and scale bar do not. (Famous label id confirmed in the plan — see
      // open questions; shown here as 'famous'.)
      return h.layer === 'poi' || h.layer === 'famous'
        ? LABEL_RECESSION
        : undefined;
    default: return undefined;                        // survey, overlay, …
  }
}
```

A function beats a flat string-keyed table here because some kinds recede across
*all* their discriminator values (`markerLayer` for every category) while others
recede for *some* (`labelLayer` for `poi`/`famous` only). The switch says exactly
that without repetition, and the exhaustive `kind` check makes a new union member
a compile error until it declares its stance — the same discipline
`serializeFadeHandle` already enforces.

Per-layer targets (approved): markers/labels dim moderately; the large diffuse
filament/volume fields recede harder. All tuned live on the dev server.

## Registry API changes

In `fadeRegistry.ts` / `FadeRegistry.d.ts`:

1. **`setFocusBlend(blend: number): void`** — stores the current blend (default
   0). Called once per frame from `runFrame`, beside the existing
   `clusterFocus` read.
2. **`opacityOf` composes recession** — after resolving the toggle scalar
   (controller `currentOpacity`, or the 1.0 fail-safe), multiply by
   `mix(1, recessionTargetFor(h) ?? 1, focusBlend)`. Non-tagged handles return
   the toggle unchanged, so existing GPU-uniform consumers (points/filaments/
   volumes) are untouched except where we intend the new behaviour.
3. **`FadeHandle` gains the descriptor-layer kinds** it lacks: `markerLayer`
   (with a `category` discriminator, mirroring the renderer's per-category
   buckets) and a `labelLayer` value for famous labels. `serializeFadeHandle`
   and `recessionTargetFor` get the matching cases.

`isAnyAnimating` is untouched — the recession ramp is owned by `clusterFocus`,
whose `isAwake()` is already in the render-on-demand predicate, so frames keep
ticking through the ramp both directions.

## Application by layer class

The single split in this design is *how* a layer turns the `opacityOf` scalar
into pixels. It follows an existing, principled line — not per-layer whim.

### Field / point layers — already consistent (just tag)

Filaments and volumes already multiply `opacityOf` into a GPU fade uniform.
They need **no pass changes** — only the `recessionTargetFor` branch:

- **Filaments** — `filamentsPass` already reads `opacityOf({kind:'filaments'})`.
  "Whichever is shown" is automatic: when off, the toggle is already 0.
- **Volumes** — `volumeUpsamplePass` already reads `volumesMaster`, which is
  multiplied into every scalar field. One branch recedes the whole volume
  subsystem regardless of active tier/field.

### Descriptor layers — read `opacityOf`, bake into per-instance alpha

POI markers and labels are CPU-built per frame with per-instance alpha, because
they need per-instance decisions (which one is focused/selected). That's the
right place for them; the change is *where the cross-cutting opacity comes from*.

**POI markers** (`produceStructureMarkers.ts`):
- Replace the **boolean category skip** (`if (!markerVisible(cat)) continue`)
  with the category's `opacityOf({kind:'markerLayer', category})`. The file's
  *emit-all-then-discard* contract already tolerates alpha-0 descriptors, so a
  mid-fade category emits faded rings and is only skipped once fully at 0 —
  index alignment holds (the skip stays all-or-nothing per category).
- Replace the **binary focus dim** with the recession already folded into that
  same `opacityOf` value. The focused structure is exempt per-instance
  (`p.id === focusedPoiId` → use 1.0); the selected-ring ×1.5 bump stays.
- `NON_SELECTED_MARKER_DIM` migrates out of `structurePoiStyles` into
  `MARKER_RECESSION` (now smoothly animated, deeper).

**POI labels + famous labels** — the wiring prerequisite first:
- **Wire the label path to consume `opacityOf`.** Labels already carry a
  per-label `fadeAlpha` (`labels/vertex.wesl`, fed from `label.sizing.w`). The
  label director multiplies each label's `fadeAlpha` by its layer's
  `opacityOf(handle)` when it finalises the set. No shader/renderer change — the
  director simply stops discarding the registry value. This single change makes
  label-layer load-in fade, category fade, *and* recession all live at once.
- **Category on/off becomes a fade** the same way markers do (boolean
  `labelVisible(cat)` skip → category `opacityOf` baked into `fadeAlpha`).
- **Recession** comes free once the layer is recession-tagged. The **focused
  structure's** POI label is exempt per-instance (the producer knows the
  structure id), so a faded ring never carries a bright label.
- **Famous-galaxy labels** are tagged to recede uniformly (no per-member
  exemption — there's no structure-membership link at the famous producer, and
  the ask is simply "they recede on focus").

## Category-visibility fade (markers + POI labels)

Today both pop. After this change both fade, through the registry:
`setCategoryMarkerVisible` / `setCategoryLabelVisible` (`engine.ts:1262–1289`)
call `fades.fadeTo(handle, on ? 1 : 0)` instead of flipping a boolean, and the
producers read `opacityOf` instead of the boolean gate. One mechanism, no pop.

## Scope decisions (locked)

- **Trigger:** any structure focus (cluster / group / supercluster / void) — it
  rides the blend, which already ramps for all of them. No per-category casing.
- **All-in-one**, including the label-path opacity wiring.
- **Galaxy name labels = famous labels** (the visible ones); the reserved
  `galaxyNames` layer is untouched.
- Markers + POI labels recede with per-instance exemption of the focused
  structure; famous labels recede uniformly.
- Per-layer recession targets, tuned live.
- Galaxy points keep member-isolation, untouched.

## Data flow

```
selection.focused() ─▶ clusterFocus.update() ─▶ blend (0→1, ~400ms)
                                                   │
                              runFrame: fades.setFocusBlend(blend)
                                                   │
   ┌───────────────┬───────────────┬──────────────┼───────────────┬──────────────┐
   ▼               ▼               ▼              ▼               ▼              ▼
opacityOf       opacityOf       opacityOf      opacityOf        opacityOf
(filaments)   (volumesMaster) (markerLayer:c) (labelLayer:poi) (labelLayer:famous)
   │               │               │              │               │
filamentsPass  volumeUpsample  produceStruct-  labelDirector ── bakes into per-label
(GPU uniform)  (GPU uniform)   Markers (alpha) fadeAlpha (alpha; focused exempt)
                               focused exempt
```

## Edge cases (fall out for free)

- **Unfocus** → blend → 0 → recession → 1.0. No reverse logic.
- **Focus a galaxy** (not a structure) → `focusedPoi` null → blend 0 → nothing
  recedes.
- **Layer/category toggled off** → toggle 0 → `0 × recession = 0`.
- **Render-on-demand** → covered by the existing `clusterFocus.isAwake()`.

## Open questions for the plan

- **Descriptor-layer handle granularity.** `markerLayer` clearly keys on
  `category`. For POI labels, does the existing single `labelLayer:poi` split
  into per-category handles (to fade category on/off), or does category fade ride
  a separate per-category sub-fade while `poi` stays the load-in layer? Resolve
  with the label code open; the spec requires only that category on/off fades and
  recession folds in.
- **Famous-label handle identity.** Confirm which `LabelLayerId` the famous
  producer renders under today and whether it needs its own handle value vs.
  reusing one.
- **Marker GPU fade buffer.** `clusterMarkerRenderer` already writes a per-frame
  fade buffer (`:549`). Confirm whether recession/category opacity belongs in the
  descriptor alpha (current path) or that uniform — avoid double-applying.

## Testing (TDD)

- **`fadeRegistry` composition** (the core, pure):
  - `opacityOf` = toggle × recession for tagged handles; = toggle for untagged.
  - `blend=0` → identity; `blend=1` → exactly the target; intermediate → lerp.
  - `setFocusBlend` re-composes subsequent reads.
  - `recessionTargetFor` is exhaustive (a missing kind fails to compile).
- **`produceStructureMarkers`** — non-focused marker alpha scales by recession at
  `blend>0`; focused marker and selected-bump unaffected; category at toggle 0
  emits alpha-0 (alignment preserved); at-rest output unchanged from today.
- **Label director** — each label's `fadeAlpha` is multiplied by its layer's
  `opacityOf`; focused POI label exempt from recession; famous labels recede;
  youAreHere / scaleBar never recede.
- **Category fade** — `setCategoryMarkerVisible(false)` drives the handle toward
  0 over the fade duration rather than dropping instantly.
- **Filaments / volumes** — no new test; covered by the registry composition test
  (they already multiply `opacityOf`).

## Files touched (anticipated)

- `src/@types/animation/FadeHandle.d.ts` — `markerLayer` (+category) and famous
  `labelLayer` value; docblock.
- `src/@types/animation/FadeRegistry.d.ts` — `setFocusBlend`.
- `src/services/animation/fadeRegistry.ts` — `recessionTargetFor`,
  `setFocusBlend`, recession in `opacityOf`, new serialization cases.
- `src/services/engine/frame/runFrame.ts` — `fades.setFocusBlend(blend)`.
- `src/services/engine/presentation/produceStructureMarkers.ts` — category
  `opacityOf` + smooth recession; drop the boolean skip and binary dim.
- `src/services/engine/presentation/produceStructureLabels.ts` /
  `produceFamousLabels.ts` — category `opacityOf`; focused-exempt recession.
- `src/services/engine/subsystems/labelDirectorSubsystem.ts` — bake layer
  `opacityOf` into per-label `fadeAlpha` (the wiring prerequisite).
- `src/services/engine/presentation/structurePoiStyles.ts` — remove
  `NON_SELECTED_MARKER_DIM`.
- `src/services/engine/engine.ts` — category visibility setters → `fadeTo`.
- `src/services/engine/wiring/registerOverlayFades.ts` — register the new
  marker/famous handles.
- `tests/` mirrors for `fadeRegistry`, `produceStructureMarkers`, label director.
```
