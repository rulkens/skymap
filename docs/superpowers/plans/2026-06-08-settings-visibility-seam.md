# Settings snapshot/restore seam — implementation plan

> **REQUIRED SUB-SKILL:** execute this plan via `superpowers:subagent-driven-development`
> (one fresh implementer subagent per task, plus spec + quality reviews). The
> main thread runs `npm test` / `npm run typecheck` and makes commits; implementers
> **edit files only** (they cannot run npm/npx — see project memory).

## Goal

Introduce a single seam for **reading** and **restoring** the toggleable visual
layers, so a programmatic caller (the upcoming guided tour) does not have to
hand-code the four scattered settings storage shapes, and can set values
**instantly** (no pending fades) OR **faded**.

This is the second of the two pre-tour decomplection refactors from the approved
spec `docs/superpowers/specs/2026-06-08-pre-tour-decomplection-design.md`
(**section 2, "Settings snapshot/restore seam"** is the source of truth — read it
first). It is **behaviour-preserving**: every observable behaviour today is
reproduced as a test *before* any structure changes, and the suite stays green
before and after.

The new public surface is exactly two functions plus one plain-data type:

- `readVisibility(state): VisibilitySnapshot` — the single geography-aware reader.
- `applyVisibility(state, patch, { animate }): void` — the single write-path;
  `animate:false` writes synchronously, `animate:true` routes through the
  existing fade orchestration.

## Architecture

### The knot today (spec §2)

The toggleable visual layers live in **four** storage shapes. Verified against
the current tree (re-verify line numbers — they drift):

| Layer | Storage shape | Read / write today |
|---|---|---|
| Surveys (SDSS/2MRS/GLADE/Famous/Synthetic) | `state.sources.drawMask` / `state.sources.pickMask` — 32-bit bitmasks (`src/utils/sourceMask.ts`: `maskHas`/`maskWith`/`maskWithout`, `ALL_VISIBLE_MASK`) | `setSourceVisibleImpl` (`engine.ts` ~195–239, **async**: flips pickMask immediately, awaits fade-out, conditionally writes drawMask, awaits fade-in). Handle `sources.setVisible`. |
| Filaments | `state.settings.filaments.enabled` (boolean) | `boringSetters.setFilamentsEnabled` then `fades.fadeTo({kind:'filaments'}, …)`. Handle `filaments.setEnabled` (`engine.ts` ~1346–1360). |
| Milky Way | `state.settings.milkyWay.enabled` (boolean) | `boringSetters.setMilkyWayEnabled` then `fades.fadeTo({kind:'overlay', id:'milkyWay'}, …)`. Handle `milkyWay.setEnabled` (`engine.ts` ~1332–1345). |
| Volumes — master | `state.settings.volumes.masterEnabled` (boolean) | `setVolumesEnabled` (`engine.ts` ~1000–1015) → settings + `fadeTo({kind:'volumesMaster'}, …)`. Handle `volumes.setMasterEnabled`. |
| Volumes — per-field | `state.settings.volumes.fields[fieldId].enabled` (`Partial<Record<VolumeFieldId, VolumeFieldSettings>>`) | `setVolumeFieldEnabled` (`engine.ts` ~1085–1102) → `writeVolumeFieldSetting` + `fadeTo({kind:'scalarField', field}, …)` + lazy debug load. Handle `volumes.setEnabled`. |
| Label categories | `state.settings.labelCategoryVisibility` (`Record<PoiCategory, boolean>`) | `setCategoryLabelVisible` (`engine.ts` ~261–293). Structure categories fire `fadeTo({kind:'labelLayer', layer:'poi', category})`; `famousGalaxy` calls `galaxies.setFamousLabelsVisible` + `fadeTo({kind:'labelLayer', layer:'galaxyNames'})`. Mirrors to settings. Handle `labels.setCategoryLabelVisible`. |
| Marker categories | `state.settings.markerCategoryVisibility` (`Record<PoiCategory, boolean>`) | `setCategoryMarkerVisible` (`engine.ts` ~295–323). Structure categories fire `fadeTo({kind:'markerLayer', category})`; `famousGalaxy` fires NO fade (no ring). Mirrors to settings. Handle `labels.setCategoryMarkerVisible`. |

Two separate complecting strands:

1. A programmatic caller must know all four storage geographies to read/restore.
2. **Fade orchestration is welded into the setters** — `setSourceVisibleImpl` is
   `async` and *awaits* fades, so an instant restore via the public setters is a
   sequential async chain.

### The un-braided shape (spec §2)

A plain-data snapshot type + a geography-aware reader + a single write-path with
an `animate` flag.

```ts
// src/@types/engine/settings/VisibilitySnapshot.d.ts  (one type per file, plain data, readonly)
export type VisibilitySnapshot = {
  readonly sourceDrawMask: number;
  readonly filamentsEnabled: boolean;
  readonly milkyWayEnabled: boolean;
  readonly volumesMasterEnabled: boolean;
  readonly volumeFieldEnabled: Readonly<Record<VolumeFieldId, boolean>>;
  readonly labelCategoryVisibility: Readonly<Record<PoiCategory, boolean>>;
  readonly markerCategoryVisibility: Readonly<Record<PoiCategory, boolean>>;
};
```

> **Key-set note (re-verify before writing):** the spec sketch used `string` keys.
> The live tree has narrower unions — prefer them: `VolumeFieldId`
> (`src/@types/data/VolumeFieldId.d.ts`) and `PoiCategory`
> (`src/@types/engine/data/PoiCategory.d.ts`). `volumeFieldEnabled` should use
> `Partial<Record<VolumeFieldId, boolean>>` if a sparse snapshot is cleaner —
> decide against `state.settings.volumes.fields` (which is
> `Partial<Record<VolumeFieldId, VolumeFieldSettings>>`); the reader iterates the
> *present* field rows. Confirm and pick the tightest type that round-trips.

### The instant-vs-fade asymmetry (the one subtlety to get right)

Some layers have **no synchronous boolean** that the renderer reads — their
producers read fade opacity directly:

- **Structure-category labels/markers**: `produceStructureLabels` /
  `produceStructureMarkers` read `fades.opacityOf({kind:'labelLayer'|'markerLayer', …})`
  for their alpha. There is **no** structure-store visibility flag (confirm:
  `setCategoryLabelVisible`/`setCategoryMarkerVisible` only fire a fade + mirror
  to settings; only the `famousGalaxy` branch writes a store boolean via
  `galaxies.setFamousLabelsVisible`). So an **instant** apply of a structure
  category must `fades.setImmediate(handle, value ? 1 : 0)` (jump the controller),
  not `fadeTo`. `settings.*CategoryVisibility` is the mirror, still written.
- **Surveys / filaments / milkyWay / volumes** *do* have a synchronous gate
  (drawMask bit / `settings.*.enabled` / `volumes.fields[id].enabled`) that the
  pass-enabled checks accept as `boolean OR opacity > 0`. For an **instant**
  apply, write that gate synchronously AND `setImmediate` the fade handle to the
  target so a half-finished ramp doesn't drift the value back.

So `applyVisibility`'s dispatch is, per touched field:

- `animate: true` → write the synchronous gate (where one exists) + `fadeTo(handle, target, dur)`.
- `animate: false` → write the synchronous gate (where one exists) + `setImmediate(handle, target)`.

This is why the seam is not "just call the existing setters": the existing setters
hardcode `fadeTo`, and `setSourceVisibleImpl` is async. `applyVisibility` is the
synchronous-capable single write-path.

### Reader/writer homes (single-function-file convention)

Per the one-function-one-file naming rule, create a new sub-folder
`src/services/engine/settings/` with:

- `src/services/engine/settings/readVisibility.ts` — exports `readVisibility`.
- `src/services/engine/settings/applyVisibility.ts` — exports `applyVisibility`.

Both take the narrow `Pick<EngineState, …>` slices they actually touch (mirror the
`setSourceVisibleImpl` / `setCategoryLabelVisible` style of accepting a `Pick` so
the tests can drive them against a partial stub without a GPU engine). The
`applyVisibility` writer reuses `maskWith`/`maskWithout` (`src/utils/sourceMask.ts`),
`writeVolumeFieldSetting` (`src/services/engine/helpers/writeVolumeFieldSetting.ts`),
and the `FADE_IN_DURATION_MS`/`FADE_OUT_DURATION_MS` constants
(`src/services/animation/fadeController.ts`).

### Harmonise with `settingsTable.ts`, do not fight it

`src/services/engine/wiring/settingsTable.ts` is the existing single-write-path
precedent (declarative `name/path/clamp/callback` rows → `mutate + echo +
requestRender`). `applyVisibility` is the *animation-aware* sibling: where a
layer is a pure `settings.*.enabled` boolean (filaments, milkyWay,
volumes.masterEnabled), the synchronous write should go through the same
`state.settings` leaf those table rows own (do not introduce a parallel mirror).
The seam adds the fade dispatch + the bitmask/per-field/category geographies the
table deliberately does not cover; it does not duplicate the table's boolean
write contract.

### Delegation (avoid a second write path)

After the seam exists, route the existing handle setters through it **where
clean**, so there is not a second write-path:

- `milkyWay.setEnabled` / `filaments.setEnabled` / `volumes.setMasterEnabled` →
  delegate to `applyVisibility(state, {<field>: enabled}, {animate: true})`.
  These are the cleanest (single boolean + single fade handle).
- `setVolumeFieldEnabled` → has an extra concern (lazy debug-volume load +
  `onFieldsChanged` echo). Delegate the **enabled write + fade** to
  `applyVisibility` and keep the lazy-load + echo at the call site, OR (if that
  split reads worse) leave it and **NOTE the overlap explicitly** in a comment.
  Implementer's judgement — do not hide the overlap either way.
- `setSourceVisibleImpl` → it is **async** (awaits fade-out before clearing
  drawMask, with last-issued-wins re-read). `applyVisibility` is synchronous and
  does NOT replicate that await/re-read. **Do NOT collapse `setSourceVisibleImpl`
  into `applyVisibility`** — the async fade-out-then-clear ordering is
  load-bearing behaviour (see `setSourceVisibleFade.test.ts` case 3). Leave
  `setSourceVisibleImpl` as the survey *toggle* path; `applyVisibility` is the
  *snapshot-restore* path (instant or simple fade). NOTE this overlap explicitly:
  two write paths touch drawMask, justified because one is the interactive
  async-await toggle and the other is the synchronous programmatic restore.
- `setCategoryLabelVisible` / `setCategoryMarkerVisible` → these carry the
  famousGalaxy store write + the no-ring-for-famous special case + the echo
  callbacks. Routing the *structure-category* fade through `applyVisibility` while
  keeping the famousGalaxy + echo concerns at the call site is acceptable but may
  read worse than leaving them. Implementer's judgement; if left, NOTE the
  overlap (both write `settings.*CategoryVisibility`).

The delegation tasks (5–8) are **behaviour-preserving**: the existing fade tests
(`setSourceVisibleFade.test.ts`, `setCategoryVisibleFade.test.ts`,
`flowFieldsHandle.test.ts`) must stay green unchanged.

## Scope guards (NON-goals — do not scope-creep)

- **Do NOT** migrate source visibility from the bitmask to a registry.
- **Do NOT** move `sources.tier` into `settings`.
- **Do NOT** generalise volume per-field params (intensity/contrast/palette/…)
  into the snapshot — only the `enabled` axis is a *visibility* layer.
- **Do NOT** add `flow` to the snapshot unless the spec's snapshot type lists it
  — it does not (`VisibilitySnapshot` has no `flowEnabled`). Flow stays out.
- Keep the change minimal: a reader + a write-path with an `animate` flag, plus
  clean delegation.

## Skymap conventions reminder (for every implementer)

- `type` aliases, never `interface`. One type per `@types` file. `readonly` on
  snapshot fields. Use `Vec2`/`Vec3` aliases if any vector appears (none expected here).
- Single-function utility files take the function's name (`readVisibility.ts`
  exports `readVisibility`).
- Didactic comments: explain *why* + the alternative, multi-paragraph module
  headers matching the surrounding files. No history notes (no dates/PR refs).
- Deep relative imports; no barrels.
- **Pause before implementing:** reuse existing helpers (`maskWith`/`maskWithout`,
  `writeVolumeFieldSetting`, the fade constants); surface the simplest alternative
  before editing. If a clean delegation is blocked by something structural, STOP
  and report rather than re-braiding around it.
- **Re-verify every cited `file:line`** against the live tree before relying on it
  — the engine.ts line numbers WILL have drifted.
- Run bash sequentially; use Read/Grep tools, not sed/awk/grep.
- The MAIN thread runs `npm test` / `npm run typecheck` and commits; you edit
  files only.

---

## Task 1 — `VisibilitySnapshot` type

**Files:**
- Create `src/@types/engine/settings/VisibilitySnapshot.d.ts`
- Test `tests/@types/visibilitySnapshot.test.ts` (a tiny type-smoke test, mirror
  an existing `tests/@types/*.test.ts` shape — e.g. `tests/@types/engineState.test.ts`)

**Contract:** the exact shape in the Architecture section. Re-verify the key-set
note: use `VolumeFieldId` / `PoiCategory` unions (not bare `string`); decide
`Record` vs `Partial<Record>` for `volumeFieldEnabled` and document the choice in
the module header.

- [ ] Add a type-smoke test that constructs a `VisibilitySnapshot` literal and
  asserts (compile-time via `satisfies` + a trivial runtime `expect`) that all
  seven fields are present and `readonly`. Name it
  `VisibilitySnapshot has the seven visibility-layer fields`.
- [ ] Run fails (type does not exist).
- [ ] Create the `.d.ts` with a didactic module header explaining: this is plain
  data (spec §2), one fold per visual layer, used by `readVisibility` /
  `applyVisibility`; why narrow unions over `string`; why per-field is `enabled`-only.
- [ ] Run passes.
- [ ] Commit.

## Task 2 — `readVisibility` (behaviour-preserving reader)

**Files:**
- Create `src/services/engine/settings/readVisibility.ts`
- Test `tests/services/engine/settings/readVisibility.test.ts`

**Signature:** `readVisibility(state: Pick<EngineState, 'sources' | 'settings'>): VisibilitySnapshot`
(confirm the minimal `Pick` — it reads `sources.drawMask` and the `settings.*`
shapes; it does NOT read fade opacity, since the synchronous gates are the truth
for surveys/filaments/milkyWay/volumes, and `settings.*CategoryVisibility` is the
truth for categories).

**Behaviour:** project each storage shape into the snapshot:
- `sourceDrawMask` ← `state.sources.drawMask`
- `filamentsEnabled` ← `state.settings.filaments.enabled`
- `milkyWayEnabled` ← `state.settings.milkyWay.enabled`
- `volumesMasterEnabled` ← `state.settings.volumes.masterEnabled`
- `volumeFieldEnabled` ← map each present `state.settings.volumes.fields[id]` to its `.enabled`
- `labelCategoryVisibility` ← shallow copy of `state.settings.labelCategoryVisibility`
- `markerCategoryVisibility` ← shallow copy of `state.settings.markerCategoryVisibility`

Return a fresh frozen-ish value (shallow copies of the records, not aliases of
live state) so a held snapshot does not mutate when state later changes.

- [ ] Add test `readVisibility returns the live values from each of the four storage shapes`:
  build a minimal state stub with a non-default `drawMask`, `filaments.enabled:false`,
  `milkyWay.enabled:true`, `volumes.masterEnabled:false`, one field
  `enabled:true` + one `enabled:false`, and mixed label/marker category maps;
  assert every snapshot field equals the corresponding source.
- [ ] Add test `readVisibility snapshot does not alias live state` — mutate
  `state.settings.labelCategoryVisibility` after reading; assert the prior
  snapshot's record is unchanged.
- [ ] Run fails.
- [ ] Implement against the live `state.settings` shape; reuse no helpers beyond
  `Object` copies. Didactic header: why the reader is geography-aware in one place.
- [ ] Run passes.
- [ ] Commit.

## Task 3 — `applyVisibility({ animate: false })` (synchronous write-path)

**Files:**
- Create `src/services/engine/settings/applyVisibility.ts`
- Test `tests/services/engine/settings/applyVisibility.test.ts`

**Signature:**
`applyVisibility(state: Pick<EngineState, 'sources' | 'settings' | 'subsystems' | 'data'>, patch: Partial<VisibilitySnapshot> | VisibilitySnapshot, opts: { animate: boolean }): void`
(confirm the minimal `Pick`: it writes `sources.drawMask`, `settings.*`, calls
`subsystems.fades.setImmediate`/`fadeTo` + `subsystems.scheduler.requestRender`,
and the famousGalaxy category branch reads `data.galaxies.setFamousLabelsVisible`
— mirror how `setCategoryLabelVisible` reaches the store).

**Behaviour (animate:false):** for each **present** key in `patch`, write the
synchronous gate AND `fades.setImmediate(handle, target)`:
- `sourceDrawMask` → assign `state.sources.drawMask` (and `pickMask`? — **decide
  and document**: a snapshot restore should set both so a restored-hidden survey
  is also unclickable; confirm against `setSourceVisibleImpl`'s pickMask
  semantics. For per-survey fade handles you must `setImmediate` each survey's
  `{kind:'survey', source}` controller to the bit value, OR — simpler and
  acceptable — leave survey fade controllers alone when restoring drawMask
  directly, since the pass reads the bit. Pick the minimal correct option and
  document the reasoning in the header.)
- `filamentsEnabled` → `state.settings.filaments.enabled = v`; `setImmediate({kind:'filaments'}, v?1:0)`
- `milkyWayEnabled` → `state.settings.milkyWay.enabled = v`; `setImmediate({kind:'overlay', id:'milkyWay'}, v?1:0)`
- `volumesMasterEnabled` → `state.settings.volumes.masterEnabled = v`; `setImmediate({kind:'volumesMaster'}, v?1:0)`
- `volumeFieldEnabled[id]` → `writeVolumeFieldSetting(..., {enabled:v})`; `setImmediate({kind:'scalarField', field:id}, v?1:0)`
- `labelCategoryVisibility[cat]` → mirror into `state.settings.labelCategoryVisibility`;
  structure category → `setImmediate({kind:'labelLayer', layer:'poi', category}, v?1:0)`;
  famousGalaxy → `data.galaxies.setFamousLabelsVisible(v)` + `setImmediate({kind:'labelLayer', layer:'galaxyNames'}, v?1:0)`
- `markerCategoryVisibility[cat]` → mirror into `state.settings.markerCategoryVisibility`;
  structure category → `setImmediate({kind:'markerLayer', category}, v?1:0)`;
  famousGalaxy → mirror only, NO fade handle (no ring — mirror `setCategoryMarkerVisible`)
- End with one `state.subsystems.scheduler.requestRender()`.

> The fade-handle dispatch (kind per layer) mirrors the existing setters
> 1:1 — read `engine.ts` setSourceVisibleImpl / setCategoryLabelVisible /
> setCategoryMarkerVisible / setVolumesEnabled / setVolumeFieldEnabled and the
> milkyWay/filaments handle literals for the exact handle shapes. Do not invent
> new handle kinds.

- [ ] Add test `applyVisibility({animate:false}) writes filaments/milkyWay/volumes gates synchronously`:
  apply a patch toggling those three; assert `state.settings.*` written
  immediately (no await), and `fades.setImmediate` called for each with the right
  handle + 0/1 (NOT `fadeTo`).
- [ ] Add test `applyVisibility({animate:false}) restores a structure label/marker category via setImmediate`:
  apply `{labelCategoryVisibility:{cluster:false}, markerCategoryVisibility:{cluster:false}}`;
  assert settings mirrored, `setImmediate({kind:'labelLayer',layer:'poi',category:'cluster'},0)` +
  `setImmediate({kind:'markerLayer',category:'cluster'},0)`, and `fadeTo` NOT called.
- [ ] Add test `applyVisibility({animate:false}) restores a survey drawMask bit`:
  apply `{sourceDrawMask: <mask with SDSS cleared>}`; assert
  `state.sources.drawMask` equals the patch value (and pickMask per the documented decision).
- [ ] Add test `applyVisibility({animate:false}) requests a render exactly once`.
- [ ] Run fails.
- [ ] Implement. Didactic header: the instant-vs-fade asymmetry (why structure
  categories MUST go through `setImmediate`, not a synchronous boolean) and the
  drawMask/pickMask decision.
- [ ] Run passes.
- [ ] Commit.

## Task 4 — `applyVisibility({ animate: true })` (fade write-path) + round-trip

**Files:**
- Modify `src/services/engine/settings/applyVisibility.ts`
- Modify `tests/services/engine/settings/applyVisibility.test.ts`

**Behaviour (animate:true):** identical synchronous-gate writes as Task 3, but
each fade-handle dispatch uses `fades.fadeTo(handle, target, target ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS)`
instead of `setImmediate`. The synchronous gate is still written (so the pass
draws through the ramp), matching the existing setters.

- [ ] Add test `applyVisibility({animate:true}) drives the fade registry for each touched layer`:
  apply a multi-layer patch; assert `fades.fadeTo` invoked for each touched
  layer with the correct handle + target + FADE_IN/OUT duration, and
  `setImmediate` NOT called for those layers.
- [ ] Add test `applyVisibility round-trip restores every layer`:
  `const snap = readVisibility(state)`; mutate several layers via
  `applyVisibility(state, {...}, {animate:false})`; then
  `applyVisibility(state, snap, {animate:false})`; assert `readVisibility(state)`
  deep-equals the original `snap` (every storage shape restored). This is the
  core acceptance test from spec §2.
- [ ] Run fails.
- [ ] Implement the `animate` branch (factor the per-field dispatch so animate
  only swaps `setImmediate` ↔ `fadeTo`).
- [ ] Run passes (+ re-run readVisibility tests stay green).
- [ ] Commit.

## Task 5 — Delegate `milkyWay.setEnabled` + `filaments.setEnabled`

**Files:**
- Modify `src/services/engine/engine.ts` (the two handle-literal setters, ~1332–1360)
- Test: existing `tests/services/engine/*` must stay green; add a focused
  regression test only if the existing coverage doesn't already pin the fade.

**Behaviour-preserving:** route each through
`applyVisibility(state, {<field>Enabled: enabled}, {animate: true})`, preserving
the `requestRender` (applyVisibility already calls it — confirm no double-render
regression; if the handle previously called `requestRender` once, applyVisibility
calling it once is equivalent).

- [ ] Confirm existing tests cover the observable behaviour (settings boolean +
  `fadeTo({kind:'filaments'|...overlay milkyWay}, …)`). If not, add
  `milkyWay.setEnabled still fades the overlay handle` /
  `filaments.setEnabled still fades the filaments handle` regression tests
  asserting the same fade + settings write as before.
- [ ] Run fails (if a new test) / establish green baseline.
- [ ] Refactor the two setters to delegate to `applyVisibility`. Keep the
  didactic comment, updated to point at the seam.
- [ ] Run passes (existing + new).
- [ ] Commit.

## Task 6 — Delegate `volumes.setMasterEnabled`

**Files:**
- Modify `src/services/engine/engine.ts` (`setVolumesEnabled`, ~1000–1015)
- Test: existing coverage; add regression if missing.

**Behaviour-preserving:** route through
`applyVisibility(state, {volumesMasterEnabled: enabled}, {animate: true})`.
Confirm no echo callback exists today (the comment says React owns it
optimistically) — applyVisibility must NOT add one.

- [ ] Establish/confirm a green baseline test for `setVolumesEnabled`
  (settings.volumes.masterEnabled + `fadeTo({kind:'volumesMaster'}, …)`).
- [ ] Refactor to delegate.
- [ ] Run passes.
- [ ] Commit.

## Task 7 — Reconcile `setVolumeFieldEnabled` (delegate the visibility half, NOTE the overlap)

**Files:**
- Modify `src/services/engine/engine.ts` (`setVolumeFieldEnabled`, ~1085–1102)
- Test: existing coverage; add regression if missing.

**Behaviour-preserving.** `setVolumeFieldEnabled` does THREE things: write
`fields[id].enabled` (via `writeVolumeFieldSetting`, with an early-return when the
field row is absent), fire the scalarField fade, lazy-load DEV debug volumes when
enabling, and echo `onFieldsChanged`. The visibility half (write + fade) is what
`applyVisibility` owns.

- [ ] Decide: delegate the **enabled write + fade** to
  `applyVisibility(state, {volumeFieldEnabled:{[id]:enabled}}, {animate:true})`
  and keep `maybeLazyLoadDebugVolume(fieldId)` + `onFieldsChanged` +
  `requestRender` at the call site — **OR** leave `setVolumeFieldEnabled` intact
  and add a comment explicitly noting the overlap with `applyVisibility`'s
  per-field branch (both write `fields[id].enabled` + fire the scalarField fade).
  Choose whichever reads cleaner; do not hide the overlap.
- [ ] Preserve the absent-field early-return semantics (if the field row doesn't
  exist, today's setter no-ops via `writeVolumeFieldSetting` returning null;
  applyVisibility must match — confirm `writeVolumeFieldSetting` is the shared
  guard).
- [ ] Establish/confirm green baseline; refactor or annotate per the decision.
- [ ] Run passes.
- [ ] Commit.

## Task 8 — Reconcile category setters (delegate structure-category fade OR NOTE overlap)

**Files:**
- Modify `src/services/engine/engine.ts` (`setCategoryLabelVisible` ~261–293,
  `setCategoryMarkerVisible` ~295–323)
- Test: `tests/services/engine/setCategoryVisibleFade.test.ts` must stay green
  unchanged.

**Behaviour-preserving.** These carry the `famousGalaxy` store write
(`galaxies.setFamousLabelsVisible`), the no-ring-for-famous special case, and the
echo callbacks (`onLabelCategoryVisibilityChange` / `onMarkerCategoryVisibilityChange`)
— which `applyVisibility` does NOT fire (it has no `cb`).

- [ ] Decide: either (a) route the **structure-category fade + settings mirror**
  through `applyVisibility(..., {animate:true})` and keep the famousGalaxy branch
  + the echo callbacks at the call site, OR (b) leave both setters as-is and add a
  comment noting the overlap (both they and `applyVisibility` write
  `settings.*CategoryVisibility` + the same per-category fade handles). The echo
  callback is the friction that may make (b) cleaner — implementer's judgement.
- [ ] Whichever path: `setCategoryVisibleFade.test.ts` passes unchanged (it pins
  the exact handles, durations, settings writes, famous-store call, and the
  famous-marker-no-fade case).
- [ ] Run passes.
- [ ] Commit.

## Task 9 — Entanglement-radar pass on the diff

**Files:** none (review only; capture findings in the PR description / backlog).

- [ ] Run the `entanglement-radar` skill over the full diff. Confirm: the four
  storage geographies now have ONE reader and ONE write-path; any remaining
  second-write-path overlaps (Tasks 5–8) are explicitly NOTED in comments, not
  hidden; the snapshot type is plain data; no new switch-on-discriminant that
  should be a registry row. Record the result (a clean pass or named residual
  knots) so the tour plan's §3 reconciliation can build on it.

---

## Self-review notes

- **Source of truth:** spec §2 of
  `docs/superpowers/specs/2026-06-08-pre-tour-decomplection-design.md`. The
  snapshot type, the `readVisibility` / `applyVisibility({animate})` surface, and
  the testing bullets are taken from there verbatim.
- **The one subtlety:** structure-category labels/markers have **no synchronous
  boolean** the renderer reads — producers read `fades.opacityOf(handle)`. So an
  *instant* (`animate:false`) apply MUST use `fades.setImmediate`, not a boolean
  write. This is the single thing most likely to be implemented wrong; Task 3's
  tests pin it. Re-verify against `produceStructureLabels` /
  `produceStructureMarkers` that they read opacity (not a store flag) before
  implementing.
- **`setSourceVisibleImpl` is deliberately NOT collapsed** into `applyVisibility`:
  it is async (awaits fade-out before clearing drawMask, with a last-issued-wins
  opacity re-read — `setSourceVisibleFade.test.ts` case 3). `applyVisibility` is
  the synchronous restore path. Two write paths touch drawMask; the overlap is
  intentional and must be noted, not hidden (spec §2: "otherwise they remain and
  we accept narrow overlap (noted, not hidden)").
- **Scope guards honoured:** no mask→registry migration, no `tier`-into-settings,
  no per-field intensity/contrast in the snapshot, no `flow` in the snapshot (the
  spec's type omits it).
- **Behaviour-preserving gate:** Tasks 1–4 add the new seam with its own tests;
  Tasks 5–8 are refactors that must keep `setSourceVisibleFade.test.ts`,
  `setCategoryVisibleFade.test.ts`, and `flowFieldsHandle.test.ts` green
  unchanged. "Green before and after" is the gate (spec §4).
- **Line numbers WILL drift** — every `engine.ts:NNN` citation is approximate as
  of plan authoring; implementers must re-verify by reading the current file
  (the setters are easy to find by name: `setSourceVisibleImpl`,
  `setCategoryLabelVisible`, `setCategoryMarkerVisible`, `setVolumesEnabled`,
  `setVolumeFieldEnabled`, and the `milkyWay`/`filaments` handle-literal entries).
- **Open decision left to the implementer (documented, not dodged):** whether
  `applyVisibility` writes `pickMask` alongside `drawMask` on a survey restore.
  Task 3 requires the implementer to pick the minimal-correct option and document
  the reasoning; the spec's snapshot type only carries `sourceDrawMask`, so the
  conservative reading is "restore drawMask; leave pickMask coupled or set it to
  match" — resolve against `setSourceVisibleImpl`'s pickMask semantics.
- **Type-key decision:** `VolumeFieldId` / `PoiCategory` narrow unions over
  `string` (spec sketch used `string`; the live tree has the unions). Confirmed
  `PoiCategory = StructureCategory | 'famousGalaxy'` and `VolumeFieldId` derives
  from `SOURCE_REGISTRY` volume entries. `volumeFieldEnabled` likely
  `Partial<Record<VolumeFieldId, boolean>>` to match the sparse
  `volumes.fields` map — Task 1 confirms.
