# Entanglement radar — MCPM Workbench state + UI layers

Scope: `tools/mcpm-workbench/src/state/**`, `tools/mcpm-workbench/src/ui/**` (except
`Viewport.tsx`), `tools/mcpm-workbench/@types/**`, preset save/load path
(`src/state/exportParams.ts` / `importParams.ts`, wired from `ui/ControlsPanel.tsx`).
Read-only review, no edits/tests/builds run.

## Findings

### 1. `buildKey` / `gridShapeKeyFor` — the same "which fields shape the grid box" fact spelled twice

**Where:** `tools/mcpm-workbench/src/state/buildKey.ts:13-26`,
`tools/mcpm-workbench/src/state/gridShapeKeyFor.ts:8-16`

**The braid:** two independently-maintained arrays enumerate overlapping subsets of
`GridSlice`'s shape-defining fields. `gridShapeKeyFor` lists exactly
`[manualCenterMpc, manualSizeMpc, manualRotation, divisor, paddingMpc]`. `buildKey`
lists the same five (different order) plus `importedBox`, plus unrelated
catalog/sim fields. Both exist to answer variants of the same question — "did the
thing that determines the grid box's shape change?" — for two different consumers
(harness-rebuild debounce vs. box-preview-timer restart). The two strands that
*could* vary independently — "what shapes a grid box" (a domain fact) and "who
needs to know when it changes" (two consumers with different debounce needs) — are
braided into two independently hand-maintained field lists instead of one list
consumed by two call sites.

**This already bit once:** `buildKey.ts`'s own docstring records the incident —
`manualRotation` was added to `gridShapeKeyFor` when F2.5 shipped rotate rings but
initially omitted from `buildKey`, so a rotate drag reached `deriveGridBox` (the
preview/render path saw it) while the *running sim* never rebuilt against it — "two
different 'the pending box changed' checks silently disagreeing," in the file's own
words. The fix that shipped was "remember to add it to both lists," not "make the
duplication structurally impossible" — so the next new grid field (a manual-rotation
axis lock, a shear parameter, whatever) reintroduces the same failure mode with the
same silent-desync signature.

**Cost:** adding one new `grid`-shape field today requires editing
`GridSlice.d.ts`, `gridSlice.ts`'s setter, `deriveGridBox` (out of scope), *and*
remembering both `buildKey` and `gridShapeKeyFor` — miss the second and the bug is
invisible until someone notices the preview timer and the harness rebuild disagree.

**Un-braided shape:** give the five shape-fields one canonical list/selector —
either `gridShapeKeyFor` becomes the single source and `buildKey` spreads it
(`[s.catalog.weightMode, ...gridShapeKeyFor(s), s.grid.importedBox, s.sim.agentCount, s.sim.initMode, s.sim.seed]`),
or extract a `GRID_SHAPE_FIELDS` accessor list both derive from. Either removes the
"edit N places" step to "edit one place, both consumers pick it up automatically."

**Confidence:** high (concrete past incident, documented by the code itself).
**Effort:** S — both functions are ~10-15 lines, no callers outside this pair need
to change shape (still returns `unknown[]`).

---

### 2. `MCPM_PARAM_KEYS` / `PARAM_SLIDER_SPECS` — same 8-key list, no compiler-enforced exhaustiveness

**Where:** `tools/mcpm-workbench/src/state/exportParams.ts:13-22` (`MCPM_PARAM_KEYS`),
`tools/mcpm-workbench/src/ui/ControlsPanel.tsx:80-145` (`PARAM_SLIDER_SPECS`)

**The braid:** both are `readonly Array<{ id: keyof McpmParams; ... }>` /
`readonly (keyof McpmParams)[]` literals spelling out the same 8 `McpmParams`
fields, independently. `McpmParams` itself is safe (an object literal typed as
`McpmParams`, e.g. `simSlice.ts`'s `DEFAULT_MCPM_PARAMS`, gets full compiler
exhaustiveness — TS errors on a missing or extra key). Array-of-`keyof` literals
get none: a ninth field added to `McpmParams` compiles cleanly while silently
missing from `MCPM_PARAM_KEYS` (dropped from every exported sidecar/preset,
`importParams`'s validator, and `buildParamsPayload`) or from
`PARAM_SLIDER_SPECS` (no slider ever appears for it — the UI's only defense is a
human reading the diff).

**Cost:** currently zero (nothing has drifted yet, and `exportParams.ts`'s own
comment already flags the goal of "the two shapes identical"). The risk is latent,
not yet paid.

**Un-braided shape:** key both off a `Record<keyof McpmParams, …>` object instead
of an array literal — TS enforces a `Record` over a closed key set is exhaustive
(missing or extra keys are compile errors), the same guarantee `DEFAULT_MCPM_PARAMS`
already gets for free. `MCPM_PARAM_KEYS` could derive from
`Object.keys(sentinel) as (keyof McpmParams)[]` where `sentinel: Record<keyof McpmParams, true>`;
`PARAM_SLIDER_SPECS` could become `Record<keyof McpmParams, Omit<ParamSliderSpec, 'id'>>`
with `Object.entries` at render time.

**Confidence:** medium (real duplicate-of-fact shape per the checklist, but
speculative — hasn't drifted, and the fix touches two files for marginal near-term
benefit).
**Effort:** S.

---

### Noted but not filed as a finding

- `tools/mcpm-workbench/src/ui/Viewport.tsx:121-123`'s `catalogKey` is a *third*
  hand-maintained "what changed" list in this family (catalog identity: sources /
  tier / packed-drop id / packed-drop name). It's out of scope (Viewport is another
  reviewer's), and its docstring plus `buildKey`'s own "everything but catalog
  identity" phrasing show the split from `buildKey` is deliberate and non-overlapping
  — not itself a duplicate. Flagging only as context: the pattern of "a new field
  needs a matching edit in one of three separate dirty-check lists" is now
  established across two files/owners, which raises the value of fixing #1 before a
  fourth list appears.
- `GridSlice.importedBox` vs. `manualCenterMpc`/`manualSizeMpc`/`manualRotation` —
  looks like value/place complecting at first glance (two representations of "the
  current box," reconciled by convention: every manual-edit setter must clear
  `importedBox`). On inspection this is essential, not accidental: `deriveGridBox`
  must echo a loaded preset's box *verbatim* (spec's round-trip-fidelity
  requirement — a hand-fitted or validation-derived box may not be exactly
  reproducible by re-deriving from divisor + padding + center/size), so *some*
  "override wins until touched" mechanism is required, and clearing it on any
  manual-path setter is the simplest resolution rule available. This mechanism is
  exactly what makes finding #1's two field-lists necessary in the first place —
  the list duplication is the accidental residue of an essential design, correctly
  scoped as the thing to fix.

## Already clean

- **`createStore`/`useStore`/`Store` type** (`state/createStore.ts`,
  `state/useStore.ts`, `@types/Store.d.ts`) — textbook thin mutable shell: one
  mutable place (the snapshot reference), pure reducers returning fresh objects on
  change / the same reference on no-op, reference-equality gates listener
  notification. Matches simplicity.md #5 exactly.
- **`exportParams`/`importParams`** (`state/exportParams.ts`, `state/importParams.ts`)
  — versioned format+version fields checked before anything else is trusted; total
  validation of every field (type, finiteness, unit-quaternion magnitude, cubic-voxel
  spread, dims-multiple-of-8) with named, actionable errors; backward-compatible
  optional fields (`sources`, `rotation`) with documented "absent ⇒ identity/unchanged"
  semantics. This is the single canonical home the spec (§10) calls for, and it holds
  up under adversarial/hand-edited input — genuinely production-ready, not merely
  passing the happy path.
- **`toggleCatalogSource`/`WORKBENCH_SOURCES`** — one ordered list is the source of
  truth for both the Data-section toggle order and `importParams`'s known-id
  validation; re-derives the array from that fixed order rather than accumulating
  click order, so state stays canonical.
- **`RAYMARCH_SETTERS`/`setPathTracerParam`** (`ui/ControlsPanel.tsx`) — exactly the
  tag+table dispatch simplicity.md #7 asks for (`Record<RaymarchSliderKey, setter>`
  keyed lookup; generic bracket-key setter for path-tracer params) rather than a
  switch/if-chain per slider.
- **UI reuse of `src/components/common`** — `Button`, `CollapsibleSection`,
  `ParamSlider`, `SliderGroup`, `CompactInfoTip` are imported directly from the main
  app, not forked. Only `Toggle`/`ToggleRow` are tool-local, each with a stated
  reason (no main-app equivalent / iOS-pill-row layout specific to this panel).
  Slider itself is *not* forked — the workbench uses the shared `ParamSlider`
  directly (the design spec's text describing a tool-local `Slider` as still
  "promoted later" is stale relative to the code, a documentation nit, not an
  architecture one).
- **`DEFAULT_MCPM_PARAMS`, `defaultViewSlice`, `defaultGridSlice`, etc.** — every
  slice default is a literal typed directly as its slice type, so the compiler
  enforces field completeness; no drift risk the way array-of-keys lists have.
- **Derived-not-stored values** — `Hud.tsx`'s NaN fraction, `HistogramPlot.tsx`'s
  `sampledTotal`, `CatalogSlice`'s doc explicitly choosing not to store the fraction
  — computed at the display site each render rather than cached and risking staleness.

## Summary

Few real knots for a state/UI layer this size and this heavily commented. One
concrete, already-proven-costly duplication (`buildKey`/`gridShapeKeyFor`), one
speculative variant of the same shape (`MCPM_PARAM_KEYS`/`PARAM_SLIDER_SPECS`), and
one thing that looks like a value/place braid on first read but is essential
complexity once the round-trip-fidelity requirement is accounted for. Preset
save/load is production-ready: versioned, exhaustively validated, backward-compatible.
UI conventions correctly reuse the main app's shared components.
