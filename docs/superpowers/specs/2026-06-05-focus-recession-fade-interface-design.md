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

> **Every layer's final opacity is `opacityOf(handle) × focusRecession(handle,
> blend)` — two independent strands, composed at the consumer, never braided into
> one stateful place.**

The two strands stay in their own homes:

- **`opacityOf(handle)`** — the FadeRegistry's existing job: the per-handle
  toggle fade (load-in, tier swap, and — newly — category on/off). **The registry
  is unchanged by this work.**
- **`focusRecession(handle, blend)`** — a new *pure* function in its own module:
  `mix(1, recessionTargetFor(handle) ?? 1, blend)`. No state of its own.

A small helper `resolveLayerOpacity(fades, handle, blend, now)` multiplies the two
for the whole-layer consumers; per-instance consumers (markers/labels) take the
two parts and combine them with their focused-instance exemption.

### Why not fold recession into `opacityOf`

The obvious-looking move — have the registry store the blend (`setFocusBlend`) and
return `toggle × recession` from `opacityOf` — **complects two independent concerns
and mirrors state**. The blend's authoritative home is `clusterFocusSubsystem`
(`FocusUniformsValue.blend`); caching it in the registry is a value×place mirror
(stale-mirror bug class), and it drags the focus concept into a module whose sole
job is fade controllers. Toggle fade and focus recession vary independently, so
they are *composed*, not braided. (Radar finding, 2026-06-06 — see
`docs/superpowers/conventions/simplicity.md` #5, #8.)

`blend` is the **same 0→1 value `clusterFocusSubsystem` already produces** —
`FocusUniformsValue.blend` (`clusterFocusSubsystem.ts:106`), already computed once
per frame at `runFrame.ts:296` and threaded into the render settings. Consumers
read it from there as a **value** (an argument), never from a mirror. It already
gates render-on-demand via `clusterFocus.isAwake()`, so no wake logic changes.

Orthogonality also makes the composition correct: recession multiplies *on top of*
the toggle fade instead of clobbering it. A layer toggled off (0) stays off
(`0 × anything = 0`); a half-faded layer recedes from where it is. And points
(survey handles) simply **never call the recession helper**, so they can't
accidentally recede — the separation is structural, not a defensive switch arm.

## Recession membership — one exhaustive function

Recession is *selective* (e.g. POI labels recede, the YOU-ARE-HERE pin and scale
bar must not), so membership is an exhaustive switch over the `FadeHandle` union
in the `focusRecession` module (mirroring `serializeFadeHandle`'s shape, but
**not** living in `fadeRegistry.ts` — recession policy is its own home):

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

## The `focusRecession` module (new) + registry handle additions

**The FadeRegistry keeps its current interface** — no `setFocusBlend`, no change
to `opacityOf`, no new dependency on focus. The recession concern lives in its own
small module:

```ts
// services/engine/presentation/focusRecession.ts (pure)
export function recessionTargetFor(h: FadeHandle): number | undefined { /* switch above */ }
export function focusRecession(h: FadeHandle, blend: number): number {
  return mix(1, recessionTargetFor(h) ?? 1, blend);
}
// thin composition sugar for whole-layer consumers:
export function resolveLayerOpacity(fades: FadeRegistry, h: FadeHandle, blend: number, now: number): number {
  return fades.opacityOf(h, now) * focusRecession(h, blend);
}
```

The only registry-adjacent change is the `FadeHandle` union gaining the
descriptor-layer kinds it lacks: **`markerLayer`** (with a `category`
discriminator, mirroring the renderer's per-category buckets) and a `labelLayer`
value for **famous** labels. `serializeFadeHandle` gets the matching cases;
`recessionTargetFor` (in the new module) declares their recession stance.

`isAnyAnimating` and render-on-demand are untouched — the recession ramp is owned
by `clusterFocus`, whose `isAwake()` is already in the predicate, so frames keep
ticking through the ramp both directions.

## Application by layer class

The single split in this design is *how* a layer turns the opacity strands into
pixels. It follows an existing, principled line — not per-layer whim.

### Field / point layers — minimal change

Filaments and volumes already multiply `opacityOf` into a GPU fade uniform. They
swap that lone call for `resolveLayerOpacity(fades, handle, blend, now)` — one
extra argument (the blend, already in the frame's render settings), no shader
change:

- **Filaments** — `filamentsPass` reads the resolved opacity for
  `{kind:'filaments'}`. "Whichever is shown" is automatic: when off, the toggle
  is already 0.
- **Volumes** — `volumeUpsamplePass` reads it for `volumesMaster`, which is
  multiplied into every scalar field. One call recedes the whole volume
  subsystem regardless of active tier/field.
- **Points** — untouched. Survey handles aren't recession-tagged *and* the points
  pass keeps calling plain `opacityOf`, so member-isolation stays the only focus
  effect on galaxies.

### Descriptor layers — read `opacityOf`, bake into per-instance alpha

POI markers and labels are CPU-built per frame with per-instance alpha, because
they need per-instance decisions (which one is focused/selected). That's the
right place for them; the change is *where the cross-cutting opacity comes from*.

Per-instance consumers take the **two parts** — `opacityOf(handle)` (toggle) and
`focusRecession(handle, blend)` — and combine them, because the focused-instance
exemption applies to the *recession* part only:

```
alpha(instance) = opacityOf(handle) × (instance is focused ? 1 : focusRecession(handle, blend))
```

**POI markers** (`produceStructureMarkers.ts`):
- Replace the **boolean category skip** (`if (!markerVisible(cat)) continue`)
  with the category's toggle `opacityOf({kind:'markerLayer', category})`. The
  file's *emit-all-then-discard* contract already tolerates alpha-0 descriptors,
  so a mid-fade category emits faded rings and is only skipped once fully at 0 —
  index alignment holds (the skip stays all-or-nothing per category).
- Replace the **binary focus dim** with `focusRecession(handle, blend)`, applied
  to every non-focused marker (`p.id !== focusedPoiId`); the focused structure
  gets factor 1; the selected-ring ×1.5 bump stays.
- `NON_SELECTED_MARKER_DIM` migrates out of `structurePoiStyles` into
  `MARKER_RECESSION` (now smoothly animated, deeper).

**POI labels + famous labels** — the wiring prerequisite first:
- **Wire the label path to consume opacity.** Labels already carry a per-label
  `fadeAlpha` (`labels/vertex.wesl`, fed from `label.sizing.w`). The label
  director multiplies each label's `fadeAlpha` by its layer's *resolved* opacity
  (`opacityOf(handle) × focusRecession`, with the focused POI label exempt from
  the recession part) when it finalises the set. No shader/renderer change — the
  director simply stops discarding the value. This single change makes label-layer
  load-in fade, category fade, *and* recession all live at once.
- **Category on/off becomes a fade** the same way markers do (boolean
  `labelVisible(cat)` skip → category toggle `opacityOf` baked into `fadeAlpha`).
- The **focused structure's** POI label is exempt from recession per-instance
  (the producer knows the structure id), so a faded ring never carries a bright
  label.
- **Famous-galaxy labels** recede uniformly (no per-member exemption — there's no
  structure-membership link at the famous producer, and the ask is simply "they
  recede on focus").

## Category-visibility fade (markers + POI labels)

Today both pop. After this change both fade, through the **toggle** half of the
model: `setCategoryMarkerVisible` / `setCategoryLabelVisible`
(`engine.ts:1262–1289`) call `fades.fadeTo(handle, on ? 1 : 0)` instead of
flipping a boolean, and the producers read `opacityOf` instead of the boolean
gate. One mechanism, no pop. (Recession composes on top, unchanged.)

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
selection.focused() ─▶ clusterFocus.update() ─▶ blend (FocusUniformsValue.blend, 0→1)
                                                   │   authoritative home; read as a value
                              runFrame threads `blend` into render settings
                                                   │
   ┌───────────────┬───────────────┬──────────────┼───────────────┬──────────────┐
   ▼               ▼               ▼              ▼               ▼
resolveLayerOpacity  resolveLayer   produceStruct-  labelDirector (POI)   labelDirector (famous)
(filaments)        Opacity(volumes) Markers         opacityOf×focus-      opacityOf×focusRecession
   │                  │             opacityOf×focus  Recession, focused    (uniform)
filamentsPass      volumeUpsample   Recession,       exempt → fadeAlpha
(GPU uniform)      (GPU uniform)    focused exempt

       opacityOf = FadeRegistry (toggle, unchanged)   focusRecession(handle, blend) = pure fn
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

- **`focusRecession` module** (the core, pure — easiest possible to test):
  - `focusRecession` = 1.0 for untagged handles at any blend.
  - tagged handles: `blend=0` → 1.0; `blend=1` → exactly the target;
    intermediate → the lerp.
  - `recessionTargetFor` is exhaustive (a missing union kind fails to compile).
  - `resolveLayerOpacity` = `opacityOf × focusRecession`.
- **`produceStructureMarkers`** — non-focused marker alpha scales by
  `focusRecession` at `blend>0`; focused marker and selected-bump unaffected;
  category at toggle 0 emits alpha-0 (alignment preserved); at-rest output
  unchanged from today.
- **Label director** — each label's `fadeAlpha` is multiplied by its resolved
  layer opacity; focused POI label exempt from recession; famous labels recede;
  youAreHere / scaleBar never recede.
- **Category fade** — `setCategoryMarkerVisible(false)` drives the handle toward
  0 over the fade duration rather than dropping instantly.
- **FadeRegistry** — no new tests; its interface is unchanged.

## Files touched (anticipated)

- `src/services/engine/presentation/focusRecession.ts` — **new** pure module:
  `recessionTargetFor`, `focusRecession`, `resolveLayerOpacity`.
- `src/@types/animation/FadeHandle.d.ts` — `markerLayer` (+category) and famous
  `labelLayer` value; docblock.
- `src/services/animation/fadeRegistry.ts` — new serialization cases only
  (`markerLayer`, famous label). **No recession, no `setFocusBlend`.**
- `src/services/engine/frame/runFrame.ts` — thread `blend` into render settings
  / producer ctx (it's already computed for `settings.focus`).
- `src/services/engine/frame/passes/filamentsPass.ts`,
  `volumeUpsamplePass.ts` — `opacityOf` → `resolveLayerOpacity(…, blend, …)`.
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
- `tests/` mirrors for `focusRecession`, `produceStructureMarkers`, label
  director.
