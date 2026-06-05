# Focus recession — consistent fade interface (implementation plan)

**Spec:** [`docs/superpowers/specs/2026-06-05-focus-recession-fade-interface-design.md`](../specs/2026-06-05-focus-recession-fade-interface-design.md)
**Date:** 2026-06-06
**Status:** Draft — awaiting review, then subagent execution.

---

## Goal

Every layer's final opacity becomes `opacityOf(handle) × focusRecession(handle, blend)` —
two independent strands, composed at the consumer, never braided into one stateful
place. When the user focuses a structure, ambient layers (filaments, volumes, other POI
markers + their labels, famous-galaxy labels) recede so the focused thing stands out;
on/off category toggles and label-layer fades stop popping and animate through the same
toggle fade. Galaxy points keep their existing per-member isolation, untouched.

## Architecture

- **`opacityOf(handle)`** stays the FadeRegistry's job (toggle fade: load-in, tier swap,
  category on/off). **The registry is unchanged by this work except new serialization cases.**
- **`focusRecession(handle, blend)`** is a NEW pure module
  `src/services/engine/presentation/focusRecession.ts`. No state of its own;
  `blend` is read as a VALUE from its authoritative home (`FocusUniformsValue.blend`,
  already threaded each frame), never cached in the registry.
- Whole-layer consumers (filaments, volumes) multiply via `resolveLayerOpacity`.
  Per-instance consumers (markers, labels) take the two parts and combine them with a
  focused-instance exemption.
- The `FadeHandle` union gains descriptor-layer granularity: `markerLayer{category}`,
  and POI `labelLayer` gains a `category`. Famous labels REUSE the existing `galaxyNames`
  handle (no new value), whose initial registration opacity changes 0→1.

**Guardrails (do not violate):**
- Do NOT add `setFocusBlend` or fold recession into `opacityOf` — that re-introduces the
  value×place mirror the radar rejected (spec section "Why not fold recession into
  `opacityOf`"). Keep recession a separate pure module.
- Recession membership lives in `focusRecession.ts` (`recessionTargetFor`), NOT in
  `fadeRegistry.ts`.
- The `FadeHandle` union change and ALL dependent exhaustive `switch` updates
  (`serializeFadeHandle`, `recessionTargetFor`) land in the SAME task/commit so the tree
  compiles + tests pass at every commit.

## Tech stack

TS + Vitest. WGSL/WESL unchanged (renderer already honours `fadeAlpha` on labels and a
single global `fadeOpacity` uniform on markers; this work changes only what feeds them).
Commands: `npm test`, `npm run typecheck`. Conventions: one type per file in `src/@types`;
`type` not `interface`; `Vec2`/`Vec3` not raw tuples; no barrel exports; didactic comments;
tests mirror the `src/` tree.

## Recession constants (placeholders — tuned live on the dev server)

Introduce named constants in `focusRecession.ts`; starting values are placeholders, NOT
final. Add a comment that they're tuned visually on the dev server.

| Constant | Layer | Placeholder start |
| --- | --- | --- |
| `FILAMENT_RECESSION` | filaments | `0.15` |
| `VOLUME_RECESSION` | volumes (rhizome/MCPM) | `0.15` |
| `MARKER_RECESSION` | non-focused POI markers | `0.35` |
| `LABEL_RECESSION` | non-focused POI + famous labels | `0.35` |

Large diffuse fields (filaments/volumes) recede harder; markers/labels dim moderately.

---

## Threading the `blend` value (read this before any task)

`blend` is `FocusUniformsValue.blend`, produced once per frame by
`state.subsystems.clusterFocus.produceFocusUniforms(nowMs)`
(`clusterFocusSubsystem.ts:104`). That call **ticks the fade controller**, so it must
run **exactly once per frame** — calling it twice double-advances the ramp.

Today it's computed late, at `runFrame.ts:262–296`, after the label director
(`:231`) and marker upload (`:240`) run. Those consumers need `blend`, so the
computation moves **earlier** and the value is stashed on `ReadyFrameContext`
(`ReadyFrameContext.d.ts` — its docstring says a new per-frame derived quantity is "a
one-line addition here"). Every consumer (producers, passes, render settings) then
reads `ctx.blend` as a VALUE. This keeps the authoritative home in `clusterFocus`,
the computation single, and the read pure — the spec's requirement B.

`focusRecession`'s pure functions still take `blend: number` as a plain argument so
they're trivially unit-testable without a `ctx`; only the call sites read `ctx.blend`.

---

## Plan 1 — Foundation

Establishes the `focusRecession` module, the `FadeHandle` union + serialization
changes, the `blend`-on-`ctx` threading, and the field/point-layer swap. After Plan 1
the tree compiles, all tests pass, filaments + volumes recede, and the union carries
descriptor-layer granularity — but markers/labels still use their old boolean gates
(Plan 2 swaps those).

### Task 1.1 — `focusRecession` pure module + tests

**Files:** `src/services/engine/presentation/focusRecession.ts` (new),
`tests/services/engine/presentation/focusRecession.test.ts` (new).

**Signatures:**
```ts
export function recessionTargetFor(h: FadeHandle): number | undefined;
export function focusRecession(h: FadeHandle, blend: number): number;
export function resolveLayerOpacity(
  fades: FadeRegistry, h: FadeHandle, blend: number, now: number,
): number;
```

**Constants** (placeholders — comment that they are tuned visually on the dev server;
see the table in the plan header): `FILAMENT_RECESSION = 0.15`, `VOLUME_RECESSION = 0.15`,
`MARKER_RECESSION = 0.35`, `LABEL_RECESSION = 0.35`.

**Behaviour:**
- `recessionTargetFor` — exhaustive `switch (h.kind)` mirroring the spec's "Recession
  membership" block (spec lines 85–101): `filaments`→`FILAMENT_RECESSION`,
  `volumesMaster`→`VOLUME_RECESSION`, `markerLayer`→`MARKER_RECESSION` (all categories),
  `labelLayer`→`LABEL_RECESSION` when `layer === 'poi' || layer === 'galaxyNames'` else
  `undefined`, `default`→`undefined`. The exhaustive `kind` check must make a future
  union member a compile error (no `default` that swallows new kinds — only the
  documented `survey`/`scalarField`/`overlay` fall through `default`). Use the same
  no-default-on-`kind` discipline `serializeFadeHandle` uses.
- `focusRecession(h, blend)` = `lerp(1, recessionTargetFor(h) ?? 1, blend)` (use
  `src/utils/math/lerp.ts` — convex form gives exact endpoints).
- `resolveLayerOpacity` = `fades.opacityOf(h, now) * focusRecession(h, blend)`.

> **NOTE:** This task depends on the `FadeHandle` union already carrying `markerLayer`
> and per-category `labelLayer`. Those land in Task 1.2. **Order 1.2 BEFORE 1.1**, OR
> fold 1.1+1.2 into one commit. The recommended order below puts 1.2 first so 1.1's
> `markerLayer` case compiles. (Listed 1.1-first only for narrative; execute 1.2 first.)

**Tests** (`tests/services/engine/presentation/focusRecession.test.ts`):
- `focusRecession returns 1.0 for an untagged handle at blend 0` — `{kind:'survey',source:…}`, blend 0 → 1.
- `focusRecession returns 1.0 for an untagged handle at blend 1` — survey, blend 1 → 1.
- `focusRecession returns 1.0 for a tagged handle at blend 0` — `{kind:'filaments'}`, blend 0 → 1.
- `focusRecession returns the exact target for a tagged handle at blend 1` — `{kind:'filaments'}`, blend 1 → `FILAMENT_RECESSION`.
- `focusRecession lerps a tagged handle at intermediate blend` — `{kind:'filaments'}`, blend 0.5 → `lerp(1, FILAMENT_RECESSION, 0.5)`.
- `recessionTargetFor tags markerLayer for every category` — assert all four `StructureCategory` values return `MARKER_RECESSION`.
- `recessionTargetFor tags poi and galaxyNames labels but not youAreHere or scaleBar` — `labelLayer{poi}`/`{galaxyNames}` → `LABEL_RECESSION`; `{youAreHere}`/`{scaleBar}` → `undefined`.
- `resolveLayerOpacity multiplies opacityOf by focusRecession` — fixture registry with a known `opacityOf`; assert product (e.g. opacity 0.5 × filament target at blend 1).
- `resolveLayerOpacity returns 0 when the toggle is 0 regardless of blend` — opacity 0 × anything = 0.

- [ ] Write the failing tests above.
- [ ] Implement `focusRecession.ts` (depends on Task 1.2's union — see NOTE).
- [ ] `npm test -- focusRecession` → all pass; `npm run typecheck` green.
- [ ] Commit.

### Task 1.2 — Extend `FadeHandle` union + ALL exhaustive switches (one commit)

**Files:** `src/@types/animation/FadeHandle.d.ts` (modify),
`src/services/animation/fadeRegistry.ts` (modify),
`tests/services/animation/fadeRegistry.test.ts` (modify).

**GREEN-BUILD REQUIREMENT (spec req A):** adding `markerLayer` and a `category` field to
POI `labelLayer` cascades compile errors through every exhaustive `switch (h.kind)` —
today `serializeFadeHandle` (`fadeRegistry.ts:44`), and after Task 1.1 also
`recessionTargetFor`. The union change and ALL dependent switch updates land in **this
same commit** so the tree compiles and tests pass at the commit boundary. Never split
the union change from its switch updates.

**Union changes** (`FadeHandle.d.ts:48–54`):
```ts
| { readonly kind: 'markerLayer'; readonly category: StructureCategory }
| { readonly kind: 'labelLayer'; readonly layer: LabelLayerId; readonly category?: StructureCategory }
```
- Add `markerLayer` as a new union member (import `StructureCategory` from
  `../engine/data/StructureCategory`).
- Add an OPTIONAL `category?: StructureCategory` to `labelLayer`. Optional, because
  `youAreHere` / `galaxyNames` / `scaleBar` carry no category; only `poi` labels key on
  category. Update the docblock (`FadeHandle.d.ts:1–46`) describing both kinds.

> **Decision resolved (do not re-open):** per-category handles for BOTH `markerLayer`
> and POI `labelLayer`; famous labels REUSE the `galaxyNames` handle (no new value).

**Serialization** (`serializeFadeHandle`, `fadeRegistry.ts:44–53`):
- `markerLayer` → `` `markerLayer:${h.category}` ``.
- `labelLayer` → `` `labelLayer:${h.layer}${h.category ? ':' + h.category : ''}` `` so a
  category-less POI handle and a per-category one don't collide, and `youAreHere` etc.
  keep their current keys (`labelLayer:youAreHere`) unchanged — **back-compat: existing
  registrations must keep serializing identically.**

**Guardrail (spec req B):** `fadeRegistry.ts` changes are serialization-only. Do **NOT**
add `setFocusBlend`, do **NOT** fold recession into `opacityOf` — that re-introduces the
value×place mirror the radar rejected (spec "Why not fold recession into `opacityOf`",
lines 55–76).

**Tests** (`tests/services/animation/fadeRegistry.test.ts`):
- `serializeFadeHandle keys markerLayer by category` — register `{kind:'markerLayer',category:'cluster'}` and `{…,category:'void'}`; assert they address distinct controllers (different `opacityOf` after divergent `fadeTo`).
- `serializeFadeHandle keeps a category-less labelLayer distinct from a per-category one` — `{labelLayer,layer:'poi'}` vs `{labelLayer,layer:'poi',category:'cluster'}` address distinct controllers.
- `serializeFadeHandle leaves youAreHere label key unchanged` — assert the legacy key still round-trips (register `{labelLayer,layer:'youAreHere'}`, fadeTo, read back).

- [ ] Add the union members + docblock update.
- [ ] Update `serializeFadeHandle` with both cases.
- [ ] Add the three serialization tests.
- [ ] `npm run typecheck` → green (this is where the cascade surfaces; resolve every
  `switch` the compiler flags, including `recessionTargetFor` if 1.1 already landed).
- [ ] `npm test -- fadeRegistry` → pass.
- [ ] Commit.

### Task 1.3 — Thread `blend` onto `ReadyFrameContext`

**Files:** `src/@types/engine/frame/ReadyFrameContext.d.ts` (modify),
`src/services/engine/frame/frameContext.ts` or `runFrame.ts` (modify — wherever the
ready context is assembled; verify with the build),
`src/services/engine/frame/runFrame.ts` (modify).

**Change:** compute the focus uniforms ONCE early and stash `blend` on `ctx`.

`ReadyFrameContext.d.ts` — add one field (the docstring invites exactly this):
```ts
/** Cluster-focus recession blend 0→1, from clusterFocus.produceFocusUniforms (ticked once/frame). */
focusBlend: number;
```

**Before/after in `runFrame.ts`:** today `clusterFocus.update(...)` +
`produceFocusUniforms(nowMs)` run at `:262–296`, AFTER the label director (`:231`) and
marker upload (`:240`). Move the `clusterFocus.update` + `produceFocusUniforms` call to
BEFORE the label-director / marker sections, capture the `FocusUniformsValue` in a local,
put `.blend` on `ctx` (`ctx.focusBlend`), and have the render `settings.focus` read the
SAME captured value (not a second `produceFocusUniforms` call — that would double-tick).

> Verify the `clusterFocus.update(focusedPoi, nowMs)` move keeps the `focusedPoi`
> resolution (`runFrame.ts:257–261`) ahead of it.

**Tests:** behavioural threading is covered by the consuming-pass tests (1.4, 2.x). Add
one focused guard if a `runFrame` test harness exists:
- `runFrame calls produceFocusUniforms exactly once per frame` — spy on the
  clusterFocus subsystem; assert call count 1. (If no such harness exists, note it and
  rely on the double-tick being caught by `clusterFocus` ramp tests + manual dev-server
  check; do NOT invent a heavy harness.)

- [ ] Add `focusBlend` to `ReadyFrameContext`.
- [ ] Move focus-uniform computation early; stash `ctx.focusBlend`; render settings read the captured value.
- [ ] `npm run typecheck` → green (every `ReadyFrameContext` literal must now set `focusBlend`).
- [ ] `npm test` → green.
- [ ] Commit.

### Task 1.4 — Filaments + volumes read `resolveLayerOpacity`

**Files:** `src/services/engine/frame/passes/filamentsPass.ts` (modify),
`src/services/engine/frame/encodeHdrSplit.ts` (modify),
`src/services/engine/frame/encodeHdrSingle.ts` (modify),
their test files if present (`tests/services/engine/frame/…` — verify).

> **Confirmed at plan-write time:** `volumesMaster` opacity is consumed in
> `encodeHdrSplit.ts:74` and `encodeHdrSingle.ts:71` (`masterOpacity =
> opacityOf({kind:'volumesMaster'}, nowMs)`), NOT in `volumeUpsamplePass.draw`. Apply
> recession at BOTH `encodeHdr*` sites. `volumeUpsamplePass.enabled`'s `opacityOf` gate
> (`:48`) stays plain (toggle-only, same reason as filaments). These two sites both read
> the master opacity — consider a tiny shared helper if the duplication grates (flag in
> F.1), but minimally just swap each `opacityOf` for `resolveLayerOpacity(…, ctx.focusBlend, …)`.

**Filaments** (`filamentsPass.ts:90–97`): swap the lone
`state.subsystems.fades.opacityOf({kind:'filaments'}, nowMs)` argument to the
`draw` call for `resolveLayerOpacity(state.subsystems.fades, {kind:'filaments'},
ctx.focusBlend, nowMs)`. The `enabled` gate (`:66–75`) stays on plain `opacityOf` — the
recession factor must not keep a toggled-off pass alive (recession is 1 at blend 0 and a
toggled-off layer has opacity 0, so `enabled` correctly reads the toggle alone).

**Volumes** (`volumeUpsamplePass.ts`): the master opacity is multiplied into every field
inside `encodeVolumes`/the upsample. Apply recession to the `volumesMaster` strand so one
call recedes the whole subsystem. **Verify where `volumesMaster` opacity is actually
consumed** (it may be in `encodeVolumes`, not `volumeUpsamplePass.draw`) — apply
`resolveLayerOpacity(…, {kind:'volumesMaster'}, ctx.focusBlend, now)` at that consumption
site, NOT the `enabled` gate (`:48`, which stays plain `opacityOf` for the same reason as
filaments). If the consumption site is `encodeVolumes`, the file list above must include
it — trace the strand before editing.

**Points stay untouched** (spec req: survey handles never call the recession helper).

**Tests:**
- `filamentsPass draw passes opacityOf × focusRecession at blend > 0` — fixture with
  filament opacity 1, `ctx.focusBlend = 1`; assert the renderer receives
  `FILAMENT_RECESSION` (spy on `filamentRenderer.draw` args). If the pass tests drive a
  mock renderer, assert the 6th arg.
- `filamentsPass draw passes plain opacityOf at blend 0` — same fixture, blend 0 →
  renderer receives the toggle opacity unchanged.
- Volume equivalent against whichever site consumes `volumesMaster` (assert the
  multiplied opacity recedes at blend 1, unchanged at blend 0). If no unit harness reaches
  that site, note it and rely on the `focusRecession` unit tests + dev-server check.

- [ ] Write the failing pass tests (or note the harness gap).
- [ ] Swap filaments `draw` opacity to `resolveLayerOpacity`.
- [ ] Apply `volumesMaster` recession at its true consumption site.
- [ ] `npm test` + `npm run typecheck` → green.
- [ ] Commit.

---

## Plan 2 — Descriptor layers

Swaps the per-instance boolean gates (markers, labels) for the composed
`opacityOf × focusRecession` with focused-instance exemption, moves the POI label
load-in fade per-category to the producer, wires `galaxyNames` for famous labels, and
flips the engine category-visibility setters to `fadeTo`. Depends on Plan 1.

### Task 2.1 — `produceStructureMarkers`: category opacity + smooth recession

**Files:** `src/services/engine/presentation/produceStructureMarkers.ts` (modify),
`src/services/engine/presentation/structurePoiStyles.ts` (modify),
`tests/services/engine/presentation/produceStructureMarkers.test.ts` (modify).

**Decision resolved (do not re-open):** marker recession/category opacity bakes into the
DESCRIPTOR alpha — the renderer's single global `fadeOpacity` uniform can't carry
per-category/per-instance opacity (spec "Resolved decisions").

**Changes:**
- **Category toggle** — replace the boolean skip `if (!structures.markerVisible(p.category)) continue`
  (`produceStructureMarkers.ts:51`) with reading the category's toggle
  `catOpacity = fades.opacityOf({kind:'markerLayer', category: p.category}, now)` and
  multiplying it into `weightedFade`. The emit-all-then-discard contract
  (`:11–21`) means a mid-fade category emits alpha-scaled rings; only a category fully at
  0 may be skipped all-or-nothing (index alignment preserved per `:14–21`). Keep the skip
  ONLY when `catOpacity === 0` (all-or-nothing per category).
- **Focus recession** — replace the binary `dim = focusedPoiId !== null && p.id !== focusedPoiId ? NON_SELECTED_MARKER_DIM : 1`
  (`:110`) with `recession = p.id === focusedPoiId ? 1 : focusRecession({kind:'markerLayer', category: p.category}, ctx.focusBlend)`.
  The focused structure gets factor 1; the selected-ring ×1.5 bump (`:123`) is unaffected.
- `produceStructureMarkers` needs the fade registry + `ctx.focusBlend`. It already takes
  `(state, ctx)`; read `state.subsystems.fades` and `ctx.focusBlend`. No signature change.
- **Remove `NON_SELECTED_MARKER_DIM`** from `structurePoiStyles.ts:157–161` (it migrates
  into `MARKER_RECESSION`, now smoothly animated + deeper). Drop the import at
  `produceStructureMarkers.ts:27`.

**Tests** (`produceStructureMarkers.test.ts`):
- `non-focused marker alpha scales by focusRecession at blend > 0` — two structures, one
  focused; `ctx.focusBlend = 1`; assert the non-focused ring/halo alpha = at-rest alpha ×
  `MARKER_RECESSION`, focused ring alpha unchanged.
- `focused marker is exempt from recession` — focused structure's ring alpha at blend 1
  equals its blend-0 alpha.
- `selected ring bump is unaffected by recession` — selected (not focused) structure
  keeps the ×1.5 bump (capped at 1).
- `a category at toggle 0 emits no markers for that category but preserves alignment` —
  set `markerLayer{cluster}` opacity 0; assert cluster descriptors are skipped wholesale
  while other categories emit in `byCategory` order (index alignment per category run).
- `a mid-fade category emits alpha-scaled descriptors` — `markerLayer{cluster}` opacity
  0.5; assert cluster rings emit at half their at-rest alpha (NOT skipped).
- `at-rest output is unchanged` — blend 0, all category toggles 1, no focus → identical
  descriptors to today (golden assertion on alpha values).

- [ ] Write the failing tests.
- [ ] Swap category gate + focus dim; remove `NON_SELECTED_MARKER_DIM`.
- [ ] `npm test -- produceStructureMarkers` + `npm run typecheck` → green.
- [ ] Commit.

### Task 2.2 — `registerOverlayFades`: per-category marker handles + `galaxyNames` → 1

**Files:** `src/services/engine/wiring/registerOverlayFades.ts` (modify),
`tests/services/engine/wiring/registerOverlayFades.test.ts` if present (verify).

**Changes:**
- **Register per-category marker handles** — for each `StructureCategory` (cluster /
  supercluster / void / group), `register({kind:'markerLayer', category}, initial)` where
  `initial` matches the session's persisted `markerCategoryVisibility` (1 if visible, else
  0), mirroring the settings-derived rationale in the module docblock (`:5–28`). Use the
  category list (`['cluster','supercluster','void','group']`) — there's a canonical list
  in `SettingsPanel.tsx:132`; if a shared exported `STRUCTURE_CATEGORIES` constant exists,
  reuse it (single source of truth) rather than re-inlining.
- **Register per-category POI label handles** — `register({kind:'labelLayer', layer:'poi', category}, initial)`
  from persisted `labelCategoryVisibility`. (The category-less `{labelLayer,layer:'poi'}`
  registration at `:69` is superseded — see Task 2.3 for whether it's removed or kept; the
  director's single load-in fade moves to the producer.)
- **Bump `galaxyNames` initial opacity 0 → 1** (`:70`). **Spec req D:** famous labels reuse
  `galaxyNames`; left at 0 they'd vanish once the producer starts consuming opacity. Update
  the docblock (`:62–71`) noting `galaxyNames` is now in use by famous labels.

**Tests:**
- `registers a markerLayer handle per structure category` — assert all four categories'
  handles resolve (non-fail-safe `opacityOf` after a `fadeTo`).
- `registers per-category poi labelLayer handles` — same for the four label handles.
- `galaxyNames registers at opacity 1` — `opacityOf({labelLayer,layer:'galaxyNames'}, now)` === 1.
- `disabled categories register at 0` — seed a settings fixture with cluster markers off;
  assert that handle's initial opacity is 0.

- [ ] Write the failing tests.
- [ ] Register the per-category marker + POI-label handles; bump `galaxyNames`.
- [ ] `npm test` + `npm run typecheck` → green.
- [ ] Commit.

### Task 2.3 — `produceStructureLabels`: per-category opacity × focused-exempt recession + per-category load-in

**Files:** `src/services/engine/presentation/produceStructureLabels.ts` (modify),
`src/services/engine/subsystems/labelDirectorSubsystem.ts` (modify),
`tests/services/engine/presentation/produceStructureLabels.test.ts` (modify),
`tests/services/engine/subsystems/labelDirectorSubsystem.test.ts` if present (verify).

**Decision resolved (do not re-open):** label opacity consumption lives in the PRODUCER
(symmetric with `produceStructureMarkers`), not the director; the director's single
`fadeTo(poi,1)` load-in moves per-category to the producer (spec req D).

**Changes:**
- **Wiring prerequisite is already satisfied** — labels carry `fadeAlpha`
  (`produceStructureLabels.ts:120–140`) and the renderer honours it. The producer simply
  stops ignoring the registry by multiplying the resolved layer opacity into `fadeAlpha`.
- Replace the boolean `if (!structures.labelVisible(p.category)) continue` (`:53`) with
  reading the per-category toggle `catOpacity = fades.opacityOf({kind:'labelLayer', layer:'poi', category: p.category}, now)`.
  (The `featured` + `markerVisible` anchor gates at `:56–59` stay.) Skip wholesale only
  when `catOpacity === 0`.
- Bake `fadeAlpha *= catOpacity × (p.id === focusedPoiId ? 1 : focusRecession({kind:'labelLayer', layer:'poi', category: p.category}, ctx.focusBlend))`.
  The producer knows the structure id, so the **focused structure's label is exempt** from
  the recession part (a faded ring never carries a bright label). Resolve `focusedPoiId`
  the same way `produceStructureMarkers` does (`produceStructureMarkers.ts:44–45`).
- **Per-category load-in fade** — the director's single one-shot
  `fadeTo({labelLayer,layer:'poi'}, 1)` (`labelDirectorSubsystem.ts:235–242`) is removed;
  the producer fires `fadeTo({kind:'labelLayer', layer:'poi', category}, 1, FADE_IN_DURATION_MS)`
  on a category's first non-empty emit. Track first-appearance per category in the
  producer (a module-level `Set<StructureCategory>` of already-fired categories, or a
  closure if the producer is refactored to one). The director keeps merge + declutter
  (`:228`, `:244–249`); only the `didFireFadeIn` block (`:70`, `:235–242`) leaves.

> **Watch the registry interaction:** if Task 2.2 dropped the category-less
> `{labelLayer,layer:'poi'}` registration, the director's removed `fadeTo` had relied on
> it; confirm nothing else fades the category-less POI handle. The producer now drives the
> per-category handles registered in 2.2.

**Tests** (`produceStructureLabels.test.ts`):
- `bakes per-category opacityOf into fadeAlpha` — `labelLayer{poi,cluster}` opacity 0.5;
  assert a cluster label's `fadeAlpha` is halved vs its at-rest value.
- `non-focused label recedes at blend > 0` — `ctx.focusBlend = 1`; non-focused structure
  label `fadeAlpha` scaled by `LABEL_RECESSION`.
- `focused structure label is exempt from recession` — focused label `fadeAlpha` at blend
  1 unchanged from blend 0.
- `a category at toggle 0 emits no labels for that category` — opacity 0 → those labels skipped.
- `at-rest output is unchanged` — blend 0, toggles 1, no focus → identical to today.

**Tests** (director):
- `director no longer fires the poi load-in fade` — drive a frame with a non-empty label
  set; assert `fades.fadeTo` is NOT called with `{labelLayer,layer:'poi'}` (the producer
  owns it now). (If the director test harness can't see producer-side fades, assert the
  director's `didFireFadeIn` path is gone — e.g. it makes no `fadeTo` call.)

- [ ] Write the failing tests.
- [ ] Producer: per-category opacity × focused-exempt recession into `fadeAlpha`; per-category load-in fire.
- [ ] Director: remove the single `poi` load-in fade block; keep merge + declutter.
- [ ] `npm test` + `npm run typecheck` → green.
- [ ] Commit.

### Task 2.4 — `produceFamousLabels`: `galaxyNames` opacity × uniform recession + load-in

**Files:** `src/services/engine/presentation/produceFamousLabels.ts` (modify),
`tests/services/engine/presentation/produceFamousLabels.test.ts` (modify).

**Decision resolved (do not re-open):** famous labels REUSE the `galaxyNames` handle and
recede UNIFORMLY (no per-member exemption — no structure-membership link at the famous
producer) (spec req D + "Resolved decisions").

**Changes:**
- Bake `fadeAlpha *= opacityOf({kind:'labelLayer', layer:'galaxyNames'}, now) × focusRecession({kind:'labelLayer', layer:'galaxyNames'}, ctx.focusBlend)`
  into every famous label (`produceFamousLabels.ts:201–218`) AND its anchor line
  (`:182–192`, so the connector fades with its label).
- **Load-in fade** — fire `fadeTo({kind:'labelLayer', layer:'galaxyNames'}, 1, FADE_IN_DURATION_MS)`
  on first non-empty emit (the famous producer's analogue of the per-category POI fire in
  2.3). Track a module-level/closure `didFire` flag. Combined with the 2.2 registration at
  1, this keeps existing famous labels visible (initial 1) and recedes them on focus.
  - **Verify** whether the initial-1 registration alone suffices (no fade needed) vs a
    fade-from-0. Spec says "registered at 1 ... and fires its load-in fade like `poi`
    does" (lines 209–216). Registering at 1 makes the load-in fade a no-op visually, but
    fire it for symmetry as the spec directs; do NOT register `galaxyNames` back at 0.

**Tests** (`produceFamousLabels.test.ts`):
- `bakes galaxyNames opacity into famous label fadeAlpha` — `galaxyNames` opacity 0.5 →
  famous label `fadeAlpha` halved.
- `famous labels recede uniformly at blend > 0` — `ctx.focusBlend = 1`; every famous
  label `fadeAlpha` scaled by `LABEL_RECESSION` (no exemption — there is no focused famous
  structure path).
- `anchor lines fade with their labels` — line `fadeAlpha` matches the owning label's.
- `at-rest output is unchanged` — blend 0, `galaxyNames` opacity 1 → identical to today.

- [ ] Write the failing tests.
- [ ] Bake `galaxyNames` opacity × recession into label + line `fadeAlpha`; fire load-in.
- [ ] `npm test` + `npm run typecheck` → green.
- [ ] Commit.

### Task 2.5 — Engine category-visibility setters → `fadeTo`

**Files:** `src/services/engine/engine.ts` (modify, the `labels` sub-handle setters at
`:1262–1292`), engine handle tests if present (verify).

**Decision resolved:** category on/off becomes the TOGGLE half of the model (a fade), so
both markers and POI labels stop popping (spec "Category-visibility fade").

**Changes** (`engine.ts:1262–1292`):
- `setCategoryLabelVisible(category, visible)`:
  - For `famousGalaxy` → keep `setFamousLabelsVisible(visible)` AND fire
    `fadeTo({kind:'labelLayer', layer:'galaxyNames'}, visible ? 1 : 0, …)` so the famous
    layer fades on toggle too. (Verify: the famous toggle currently flips a boolean store
    flag the producer reads to early-return; reconcile so the fade drives visibility, or
    keep the store flag gating emit while the fade drives alpha — match the markers
    pattern. The producer's `famousLabelsVisible` early-return at `produceFamousLabels.ts:130`
    would HARD-skip during fade-out; to fade out smoothly the gate must allow emit while
    opacity > 0, like `filamentsPass.enabled`. Trace this and choose the minimal coherent
    change; if a boolean hard-gate must stay, note that famous category toggle pops on
    OUT — flag it for the user rather than hacking.)
  - For structure categories → keep `setLabelVisible(category, visible)` (store flag, now
    unused by the producer for gating — confirm and consider removing the store axis if it
    no longer gates) AND fire `fadeTo({kind:'labelLayer', layer:'poi', category}, visible ? 1 : 0, …)`.
- `setCategoryMarkerVisible(category, visible)`:
  - For structure categories → keep `setMarkerVisible(...)` (or retire if unused for
    gating) AND fire `fadeTo({kind:'markerLayer', category}, visible ? 1 : 0, …)`.
  - `famousGalaxy` stays a no-op for markers (`:1278–1283`).
- Use `FADE_IN_DURATION_MS` / `FADE_OUT_DURATION_MS` per direction, mirroring the
  filaments/milkyWay setters (`engine.ts:1245–1252`). Keep the settings-mirror +
  callback + `requestRender()` (`:1268–1275`, `:1284–1291`).

> **Note on store-flag vs fade:** the producers (2.1, 2.3) now read `opacityOf` instead of
> `markerVisible`/`labelVisible`. The store's boolean visibility axis may become dead. Decide
> per-axis: remove the store flag if nothing reads it (single source of truth — the fade
> handle), or keep it if other consumers (pick gating, SettingsPanel state echo) still read
> it. Trace `markerVisible`/`labelVisible` readers before deleting. This is a "tidy the
> strands you touch" call, not a mandate to rip out the store axis.

**Tests:**
- `setCategoryMarkerVisible(cluster, false) fades the handle toward 0` — call setter;
  assert `fades.opacityOf({markerLayer,cluster})` is animating toward 0 (not instantly 0).
- `setCategoryLabelVisible(cluster, false) fades the poi cluster handle toward 0`.
- `setCategoryLabelVisible(famousGalaxy, false) fades galaxyNames toward 0`.

- [ ] Write the failing tests.
- [ ] Swap both setters to fire `fadeTo` on the per-category / galaxyNames handles.
- [ ] Reconcile the famous fade-out gate (or flag the pop-on-out if a hard gate must stay).
- [ ] `npm test` + `npm run typecheck` → green.
- [ ] Commit.

---

## Final task — entanglement radar (spec req C)

### Task F.1 — Run `entanglement-radar` on the full diff; resolve real knots

**Files:** none new — review + targeted fixes only.

- [ ] Run the `entanglement-radar` skill on `git diff main...HEAD` (the full
  Plan 1 + Plan 2 diff).
- [ ] Resolve every finding that is a REAL knot (two independent things braided), per
  `simplicity.md`. Watch specifically for:
  - **A re-braiding regression** — any reintroduction of `setFocusBlend`, a blend cached
    in the registry, or recession folded into `opacityOf` (spec req B). If found, that's a
    knot to undo, not accept.
  - **A second store-flag-vs-fade mirror** — if `markerVisible`/`labelVisible` store flags
    remain AND duplicate the fade-handle visibility, that's a value×place mirror (#5, #8);
    consolidate.
  - **Duplicated category list** — the `['cluster','supercluster','void','group']` literal
    appears in `SettingsPanel.tsx`, `registerOverlayFades`, and possibly the producers'
    load-in tracking; route through one canonical exported constant (#8).
  - **Repeated `focusedPoiId` resolution** — markers and structure labels both recompute
    the focused/selected POI id (`produceStructureMarkers.ts:42–45`); if the duplication is
    load-bearing, consider a tiny shared helper (generalize repeated fixes).
- [ ] Re-run `npm test` + `npm run typecheck` → green after any radar-driven edits.
- [ ] Commit (or note "no significant complecting found" if the radar is clean — a valid
  result per `simplicity.md`).

---

## Self-review (done at plan-write time)

- **Spec coverage:** every "Files touched (anticipated)" entry (spec lines 303–333) maps
  to a task — `focusRecession.ts`→1.1; `FadeHandle.d.ts`+`fadeRegistry.ts`→1.2;
  `runFrame.ts` blend threading→1.3; `filamentsPass`/`volumeUpsamplePass`→1.4;
  `produceStructureMarkers`+`structurePoiStyles`→2.1; `registerOverlayFades`→2.2;
  `produceStructureLabels`+`labelDirectorSubsystem`→2.3; `produceFamousLabels`→2.4;
  `engine.ts` setters→2.5. Every spec "Testing (TDD)" bullet (lines 283–301) has a named
  test in 1.1/2.1/2.3/2.4/2.5.
- **Green build at every commit (req A):** the union change + all switch updates are one
  task (1.2); 1.1 is ordered to land with/after it (NOTE). Each task ends with
  `npm test` + `npm run typecheck` green before commit.
- **Un-braided architecture (req B):** registry stays serialization-only (1.2 guardrail);
  recession is a separate pure module (1.1); blend read as a value off `ctx` (1.3); the
  "no `setFocusBlend`" guardrail appears in 1.2 and is re-checked in F.1.
- **Resolved decisions (req D):** per-category handles (1.2, 2.2); famous reuse
  `galaxyNames` + 0→1 (2.2, 2.4); marker recession baked into descriptor alpha (2.1);
  label consumption in producers (2.3, 2.4); director load-in moves to producer (2.3).
- **Constants (req E):** named placeholders with a tuned-live note in 1.1; exact targets
  NOT baked.
- **Type-name consistency:** `recessionTargetFor`, `focusRecession`, `resolveLayerOpacity`,
  `FILAMENT_RECESSION`/`VOLUME_RECESSION`/`MARKER_RECESSION`/`LABEL_RECESSION`,
  `{kind:'markerLayer', category}`, `{kind:'labelLayer', layer, category?}` used
  identically across all tasks.
- **Placeholder scan:** no `TODO`/`TBD`/`???` left; the two genuine "verify at execution"
  flags (volumes consumption site in 1.4; famous fade-out gate in 2.5) are explicit
  trace-then-decide instructions, not unresolved gaps.

## Conventions reminder (CLAUDE.md)

One type per file in `src/@types` (`FadeHandle` stays one file; no new co-located types);
`type` not `interface`; `Vec3`/`Vec4` aliases not raw tuples; no barrel exports; didactic
multi-paragraph comments on new modules (`focusRecession.ts` gets a module header
explaining the compose-not-braid rationale); tests mirror the `src/` tree under `tests/`.
Commands: `npm test`, `npm run typecheck`.
