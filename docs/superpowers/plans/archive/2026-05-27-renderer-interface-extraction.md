# Renderer Interface Extraction — scalarVolumeRenderer Conformance + Fade Ownership

> **⚠️ ARCHIVED — SUPERSEDED, do not execute.** This plan's two objectives both
> moved on after it was written (2026-05-27):
> - **Objective 1 (FieldEntry mirror state → per-frame settings projection through
>   `draw()`)** shipped independently via **ADR 0006 / PR #271** (volume-settings
>   unification, 2026-06-06). `FieldEntry` no longer carries the mirror props; the
>   renderer reads settings each frame via `draw(…, settingsOf, fadeOpacityOf)`.
>   Tasks 1–7 are moot.
> - **Objective 2 (fade GPU resources → `FadeRegistry.bindGroupFor`/`flushGpu`,
>   executing ADR 0001)** is still open in the code, but the *mechanism* was
>   redesigned. The live design is the fade-ownership work
>   (`specs/2026-06-14-fade-ownership-design.md` → merged into
>   `specs/2026-06-15-fade-ownership-visibility-seam-merged-design.md`, "designed,
>   awaiting plans"), which replaces `bindGroupFor`/`flushGpu` with a declarative
>   layer manifest + intent API; PR #317 already landed the FadeId Model A rename
>   underneath it. Execute that spec's plan when written, not Tasks 8–11 here.
>
> Kept for archaeology (the per-field-projection rationale and the renderer-
> convention reasoning are still good reading). The stale "Option C" outlier note
> this plan was going to remove from `conventions/renderers.md` was removed when
> this plan was archived.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Sister documents:**
> - [`docs/adrs/0001-fade-ownership.md`](../../../adrs/0001-fade-ownership.md) — the decision this plan executes for fade GPU resources.
> - [`docs/superpowers/conventions/renderers.md`](../conventions/renderers.md) — the existing renderer convention this plan brings `scalarVolumeRenderer` into conformance with (the "Option C" outlier note at the bottom of that doc is what motivates this plan).
>
> **Conventions** (from `CLAUDE.md` + memory):
> - Didactic comments — explain *why* and *what the alternative was*, not just *what*.
> - `type` aliases never `interface` — `export type X = { ... }`.
> - Tests live under `tests/`, mirror `src/` tree, vitest `node` env.
> - Be meticulous with WGSL/WESL — slow down on shader edits, verify visually before claiming done.
> - Minimise stateful surface — pure helpers are unit-tested, factory shells are verified by the smoke test.

---

## Why this plan exists

The volume renderer post-mortem (2026-05-27 architecture review) surfaced
two entangled structural warts in `scalarVolumeRenderer`:

1. **Mirror state.** `FieldEntry` carries 10 per-field settings
   (`enabled`, `intensity`, `contrast`, `contrastCenter`, `densityScale`,
   `envelopeInner`, `envelopeOuter`, `exposure`, `trim`, `paletteId`)
   that have an authoritative home in `EngineState`. Each one has its
   own setter (`setIntensity`, `setContrast`, …) called sequentially
   from slot commit. Six imperative calls per slot, no atomic
   `applySettings(handle, partial)`. Already flagged as the "Option C"
   work in the renderer conventions doc.
2. **Fade GPU plumbing leaked into per-instance state.**
   `FieldEntry.fadeBuffer` and `FieldEntry.fadeBindGroup` are owned by
   the renderer but allocated, written, and bound on behalf of an
   orthogonal subsystem. ADR 0001 decided this should move to the
   `FadeRegistry`.

Both warts narrow `FieldEntry` to the same set of fields if we fix them
together — drop the 10 mirror props + the 2 fade GPU resources, and
what remains is exactly the GPU resources the renderer actually owns
(`volumeTexture`, `paletteTexture`, `uniformBuffer`, `bindGroup` and
the per-cube matrices). Doing them in one coordinated pass is cheaper
than two sequential refactors that each touch every slot.

The pattern this lands — per-frame settings projection threaded
through `draw()` + subsystems owning their GPU resources — is the
shape every future renderer (label effects, selection ring, more
volumes, line/mesh overlays) should be built on. Codifying it in
`scalarVolumeRenderer` first turns it from "convention doc says so"
into "every renderer demonstrates it."

## Goal

`scalarVolumeRenderer` conforms to the renderer conventions doc:
no mirror state, per-frame settings projection threads through
`draw()`, GPU resources owned by their subsystem. `FieldEntry` shrinks
from 12 mutable properties to 5 (the GPU resources the renderer
actually owns). The per-slot setter cascade (`setIntensity`,
`setContrast`, …) collapses to one `applySettings(handle, partial)`
entry point. The fade `bindGroup` is fetched from the registry rather
than stored. The conventions-doc outlier note is removed.

## Architecture

```
Before (today):                          After (this plan):

EngineSettingsState                      EngineSettingsState
       │                                        │
       │ each setter writes to                  │ once per frame, projected
       │ both EngineState AND                   │ into VolumeFieldsState
       │ renderer.setX(handle, v)               │
       ▼                                        ▼
  FieldEntry (12 props)                   VolumeFieldsState (per-frame, immutable)
  ├─ 10 mirror props ───────► [GONE]              │
  ├─ paletteTexture                                │ threaded into
  ├─ volumeTexture                                 ▼
  ├─ uniformBuffer                          renderer.draw(pass, viewProj,
  ├─ bindGroup                                     viewportPx, cameraPos,
  ├─ modelMatrix                                   volumeFields)  ◄── reads here
  ├─ invModelMatrix                                │
  ├─ fadeBuffer ──────────────► [moves to        │ asks per handle:
  ├─ fadeBindGroup ────────────► FadeRegistry]   │   fades.bindGroupFor(h)
                                                  ▼
                                            FieldEntry (5 props)
                                            ├─ paletteTexture (palette cache)
                                            ├─ volumeTexture
                                            ├─ uniformBuffer
                                            ├─ bindGroup
                                            └─ modelMatrix + invModelMatrix
```

The slot commit path collapses from six imperative setters to one
`applySettings`:

```ts
// Before
renderer.addField(handle, cube);
renderer.setContrast(handle, c);
renderer.setDensityScale(handle, d);
renderer.setEnvelope(handle, ei, eo);
renderer.setExposure(handle, e);
renderer.setTrim(handle, t);
renderer.setFieldPalette(handle, p);
fades.register({ kind: 'scalarField', field: handle });

// After
renderer.addField(handle, cube, { paletteId });
fades.register({ kind: 'scalarField', field: handle });
// Per-field tunables flow through the per-frame settings projection;
// no per-setter wiring in the slot.
```

## Tech Stack

TypeScript (strict, `noUncheckedIndexedAccess`), WebGPU, WESL (linker
plugin), Vitest (`node` env). No build-time additions.

---

## File Structure

### Created

- `src/@types/rendering/VolumeFieldsState.d.ts` — the per-frame
  projection type, indexed by `ScalarFieldHandle`.
- `src/services/engine/frame/projectVolumeFields.ts` — pure projection
  from `EngineSettingsState` to `VolumeFieldsState`.
- `tests/services/engine/frame/projectVolumeFields.test.ts` — projection
  unit tests.
- `tests/services/animation/fadeRegistryGpu.test.ts` — registry's new
  `bindGroupFor` / `flushGpu` tested against a mock device.

### Modified

- `src/@types/rendering/FieldEntry.d.ts` — strip the 10 mirror props
  and the 2 fade GPU props. Final shape: 5 fields.
- `src/@types/rendering/ScalarVolumeRenderer.d.ts` — drop all per-field
  setters except `applySettings`; tighten `addField` signature to take
  required `paletteId`.
- `src/@types/animation/FadeRegistry.d.ts` — add `bindGroupFor` and
  `flushGpu`.
- `src/services/animation/fadeRegistry.ts` — implementation of both.
  Constructor takes `device` + `fadeBgl`.
- `src/services/gpu/renderers/scalarVolumeRenderer.ts` — `draw` takes
  `volumeFields: VolumeFieldsState`; mirror writes deleted; fade GPU
  fields deleted from `addField`; `applySettings` added.
- `src/services/engine/frame/encodeVolumes.ts` — build projection
  once, thread into renderer.
- `src/services/engine/frame/runFrame.ts` — call
  `fades.flushGpu(now)` once after `fades.tick(now)`, before the
  first draw.
- `src/services/loading/slots/cf4DensitySlot.ts` — collapse 6 setter
  calls into `addField` + one `applySettings`.
- `src/services/loading/slots/mcpmSlot.ts` — same shape.
- `src/services/loading/slots/syntheticVolumeSlots.ts` — same shape.
- `src/services/engine/wiring/settingsTable.ts` — per-field volume
  settings entries no longer call into the renderer; they only mutate
  `EngineSettingsState` and `requestRender()`. The projection picks
  them up next frame.
- `src/services/gpu/renderers/filamentRenderer.ts`,
  `pointRenderer.ts`, `structureMarkerRenderer.ts` — drop their own
  `fadeBuffer` / `fadeBindGroup` per-instance fields; ask the registry
  for the bind group at bind time.
- `src/services/gpu/renderers/labelRenderer*.ts` — same (only if their
  fade integration matches the per-handle shape; some label renderers
  may opt out per ADR 0001's scope clause — check during T8).
- `docs/superpowers/conventions/renderers.md` — remove the
  `scalarVolumeRenderer` mirror-state outlier note; add a paragraph
  pointing renderers at `FadeRegistry.bindGroupFor`.

### Tests touched

- `tests/services/gpu/renderers/scalarVolumeRenderer.test.ts` — gains
  contract tests against the new `applySettings` entry point. The
  goal is to close most of the test-parity gap with `pointRenderer`
  (post-mortem flagged 27% parity); this plan should land at ~70%.

---

## Task 0: Pre-flight — verify baseline

**Files:** none (read-only).

- [ ] **Step 1: Baseline tests green.** Run `npm test`. Expected: all
  pass (current count ~590+). Note the exact count.
- [ ] **Step 2: Typecheck clean.** Run `npm run typecheck`. Zero errors.
- [ ] **Step 3: Dev server reachable.** Confirm `npm run dev` is up
  (project convention — it's left running). You'll use it in Tasks 7
  and 13.
- [ ] **Step 4: Read ADR 0001 end-to-end.** It's the source of truth for
  Tasks 8–11. If anything in this plan contradicts the ADR, the ADR
  wins; flag the contradiction and stop.

If baseline is broken, STOP and report — don't push onto a red
baseline.

---

## Task 1: Define `VolumeFieldsState`

**Files:**
- Create: `src/@types/rendering/VolumeFieldsState.d.ts`

The shape is the per-frame, immutable projection of every registered
volume field's settings. Keyed by `ScalarFieldHandle` (the same string
union the registry uses; see `src/@types/rendering/ScalarFieldHandle.d.ts`).

- [ ] **Step 1: Write the failing test first.**
  - Create `tests/@types/rendering/VolumeFieldsState.types.test.ts`.
  - Import-only test: assert via `expectTypeOf` (or a plain `satisfies`
    check) that a literal `VolumeFieldsState` with one field's worth of
    every property compiles. This anchors the shape.
- [ ] **Step 2: Write the type.** Match the property list to what
  `FieldEntry` carries today (less the GPU resources). Include a
  didactic module header: why "per-frame projection," why immutable,
  why `Readonly<Record<…>>`.
- [ ] **Step 3: Run the test.** Should now compile.
- [ ] **Step 4: Typecheck.** `npm run typecheck`.

---

## Task 2: Project from `EngineSettingsState`

**Files:**
- Create: `src/services/engine/frame/projectVolumeFields.ts`
- Create: `tests/services/engine/frame/projectVolumeFields.test.ts`

- [ ] **Step 1: Write failing tests** covering:
  - empty settings → empty projection,
  - one registered field with default settings → projection has one
    entry with those defaults,
  - field present in settings but disabled → projection still includes
    it (the renderer needs to know to skip),
  - per-field tunables (`intensity`, `contrast`, …) round-trip exactly.
- [ ] **Step 2: Implement `projectVolumeFields(settings, registered)`.**
  Pure function. Reads `settings.volumes` and the set of registered
  handles; returns `VolumeFieldsState`. No GPU access; no state.
- [ ] **Step 3: Tests green.**
- [ ] **Step 4: Typecheck.**

---

## Task 3: Thread the projection into `draw()`

**Files:**
- Modify: `src/services/engine/frame/encodeVolumes.ts`,
  `src/services/engine/frame/passes/scalarVolumePass.ts` (if separate
  from `encodeVolumes` post-2026-05-21), and
  `src/services/gpu/renderers/scalarVolumeRenderer.ts`.

This task only plumbs the projection through; the renderer ignores it
for now. Goal: prove the wiring compiles and ships before changing
runtime behavior.

- [ ] **Step 1:** In `encodeVolumes`, call `projectVolumeFields(...)`
  once per frame and pass the result into the renderer's `draw`.
- [ ] **Step 2:** Add the parameter to `ScalarVolumeRenderer.draw`'s
  signature. Renderer logs the count of fields it received as a debug
  assertion (`if (DEBUG_VOLUMES)` style — gated). Otherwise reads
  nothing from it yet.
- [ ] **Step 3:** Update `tests/services/gpu/renderers/scalarVolumeRenderer.test.ts`
  to pass an empty projection where the test previously called `draw`.
- [ ] **Step 4:** All tests green; typecheck clean.

---

## Task 4: Migrate `intensity` from mirror to projection

**Files:**
- Modify: `scalarVolumeRenderer.ts`, `FieldEntry.d.ts`,
  `ScalarVolumeRenderer.d.ts`, the slot files, `settingsTable.ts`.

This is the **template task** — every subsequent setter migration in
T5–T7 follows the same shape. Keep the diff small and the pattern
visible.

- [ ] **Step 1: Failing test first.** In
  `tests/services/gpu/renderers/scalarVolumeRenderer.test.ts`, add a
  test: render with one field at `intensity: 0.3`, capture the
  per-instance uniform write, assert the right slot of the scratch
  buffer received `0.3`. The test should fail today because the
  renderer reads `e.intensity` (mirror) instead of
  `volumeFields[h].intensity`.

  Wait — today the test wouldn't fail; the renderer reads its own
  mirror. So write the test against the *new* shape: pass a projection
  with `intensity: 0.3`, assert the uniform write. Then the test will
  fail until Step 2 lands.
- [ ] **Step 2: In `draw`, read `volumeFields[handle].intensity`**
  instead of `entry.intensity`. Delete `entry.intensity` from
  `FieldEntry`. Delete the `intensity` placeholder in `addField`.
- [ ] **Step 3: Delete `setIntensity`** from
  `ScalarVolumeRenderer.d.ts` and the implementation. Find every call
  site (`grep -rn "setIntensity" src/ tests/`) and remove — they should
  all be slot files or `settingsTable.ts`.
- [ ] **Step 4: In `settingsTable.ts`**, change the
  `volumes.fields.<id>.intensity` entry: no `apply` call into the
  renderer; only `requestRender()`. EngineState mutation alone is
  sufficient because the projection picks it up next frame.
- [ ] **Step 5: Tests green; typecheck clean.**

---

## Task 5: Migrate `enabled`

**Files:** as Task 4.

`enabled` is mechanically identical but has one subtlety: the
visibility-gating logic in `draw` reads `enabled` and `opacity`
together to decide skip. The new read site is
`volumeFields[h].enabled` — same shape as Task 4 but check the
condition at line ~556 of `scalarVolumeRenderer.ts` carefully against
the post-mortem note.

- [ ] **Step 1: Failing test.** Render with one disabled field; assert
  the renderer issued zero draw calls for it.
- [ ] **Step 2: Migrate.** Same pattern as T4.
- [ ] **Step 3: Tests green; typecheck.**

---

## Task 6: Migrate the seven HDR-presentation props

**Files:** as Task 4.

Bundle these — they're all the same mechanical pattern, all going
through the same per-instance uniform write at lines ~568–574 of the
current renderer:

- `contrast`
- `contrastCenter`
- `densityScale`
- `envelopeInner`
- `envelopeOuter`
- `exposure`
- `trim`

- [ ] **Step 1: Failing tests.** One test per prop, each setting the
  prop via the projection and asserting the corresponding scratch-buffer
  slot. Seven small tests is fine; a parameterised loop is fine too.
- [ ] **Step 2: Migrate in one diff.** Replace `e.contrast` →
  `volumeFields[h].contrast` and the six siblings. Delete the props
  from `FieldEntry`. Delete the setter methods. Delete the placeholder
  seeds in `addField` (the ones the post-mortem flagged at lines 360–
  395 as "immediately overwritten").
- [ ] **Step 3: Delete the seven setters** from the type and impl.
  Update `settingsTable.ts` entries the same way as T4 Step 4.
- [ ] **Step 4: Tests green; typecheck clean.**

---

## Task 7: Migrate `paletteId`

**Files:** as Task 4, plus palette cache logic in
`scalarVolumeRenderer.ts`.

Palette is the only setter that maps to a GPU resource (the LUT
texture). The renderer keeps a `Map<ScalarFieldPaletteId, GPUTexture>`
palette cache; `paletteId` in the projection tells the renderer which
texture to bind. The texture isn't in the projection — only its
identifier.

- [ ] **Step 1: Failing test.** Add an entry with `paletteId: 'viridis'`,
  swap the projection to `paletteId: 'magma'`, assert the renderer
  rebuilds the per-field bind group with the magma texture.
- [ ] **Step 2: Implement.** In `draw`, look up
  `volumeFields[h].paletteId` and resolve via the palette cache. If
  the bound palette differs from last frame for this field, rebuild the
  per-field bind group on the fly. (Cost: one bind-group create per
  palette switch per field — palettes rarely change, so this is fine.)
- [ ] **Step 3: Delete `setFieldPalette` and the `paletteId` /
  `paletteTexture` mirror writes.** `paletteTexture` may stay on
  `FieldEntry` as a cached resolved-texture pointer; decide based on
  whether a per-frame `Map.get` is hot. (Hint: this loop runs N=≤5
  times per frame in practice — `Map.get` is fine.)
- [ ] **Step 4: Tests green; typecheck clean.**

### After Task 7: `applySettings` synthesis

By the end of T7, all per-field setters are gone from the renderer's
type. The renderer never receives "applied settings" through a method
— it reads them from the per-frame projection. The slot commit
collapses to one `addField` call.

But: slots and tests may still want a one-shot "snapshot these
settings into EngineState" helper. Add **on the engine side, not the
renderer**:

- [ ] **Step 5: Add `engine.volumes.applySettings(handle, partial)`**
  in the engine's public handle, calling the same path as the
  SettingsPanel UI. Slots use this to seed registry defaults at field
  registration. Renderer is *not* involved; it sees the change at next
  draw via the projection.

This makes the engine handle's volume surface match the convention
doc's "settingsTable is the single write path" guidance.

---

## Task 8: `FadeRegistry.bindGroupFor` + `flushGpu`

**Files:**
- Modify: `src/@types/animation/FadeRegistry.d.ts`,
  `src/services/animation/fadeRegistry.ts`.
- Create: `tests/services/animation/fadeRegistryGpu.test.ts`.

Per ADR 0001 §Decision items 1–2.

- [ ] **Step 1: Failing tests.** In the new gpu test file:
  - `bindGroupFor(h)` returns a `GPUBindGroup` (asserted against a
    mock device); a second call for the same handle returns the same
    instance (caching);
  - `flushGpu(now)` calls `device.queue.writeBuffer` once per
    registered handle, with the bytes matching the controller's
    `currentOpacity(now)` cast to f32 + 12 bytes of padding;
  - `unregister(h)` destroys the buffer and bind group.
- [ ] **Step 2: Implement.** The registry constructor now takes
  `device: GPUDevice` and `fadeBgl: GPUBindGroupLayout`. Add a
  parallel `Map<string, { buffer: GPUBuffer; bindGroup: GPUBindGroup }>`
  keyed by the same serialization. Lazy-allocate in `bindGroupFor`.
- [ ] **Step 3: Update `FadeRegistry` factory call sites.**
  `initGpu.ts` constructs the registry with `device` + `fadeBgl`.
  Existing fadeBgl ownership: it currently lives near the renderers;
  per ADR 0001 §Implementation Notes item 4, move it into the
  `services/animation` folder.
- [ ] **Step 4: Tests green; typecheck.**

---

## Task 9: `scalarVolumeRenderer` consumes `bindGroupFor`

**Files:**
- Modify: `scalarVolumeRenderer.ts`, `FieldEntry.d.ts`.

Per ADR 0001 §Decision items 3.

- [ ] **Step 1: Failing test.** Spy on `device.createBuffer` calls
  inside `addField`; assert the renderer no longer creates a fade
  buffer. Spy on `device.queue.writeBuffer` during `draw`; assert no
  fade-buffer write (only the per-field uniform write).
- [ ] **Step 2: Migrate.** In `addField`, delete the
  `fadeBuffer` + `fadeBindGroup` allocation (lines 347–356 today).
  In `draw`, delete the `fadeOpacityOf` read + `fadeBuffer` write,
  and replace `pass.setBindGroup(1, e.fadeBindGroup)` with
  `pass.setBindGroup(1, fades.bindGroupFor(e.handle))`. Renderer
  still needs `fadeOpacityOf` for visibility gating (T5 condition) —
  keep that read.
- [ ] **Step 3: Strip `fadeBuffer` and `fadeBindGroup` from
  `FieldEntry`.** Type is now down to the 5 GPU/matrix props.
- [ ] **Step 4: Tests green; typecheck clean.**
- [ ] **Step 5: Visual smoke check** in the dev server: load CF-4
  density, fade in/out, confirm opacity animates as before.

---

## Task 10: Migrate other renderers to `bindGroupFor`

**Files:**
- Modify: `filamentRenderer.ts`, `pointRenderer.ts`,
  `structureMarkerRenderer.ts`, and the label renderers if applicable.

Mechanical repeat of T9. Per ADR 0001 §Implementation Notes item 1,
order is lowest-risk first:

- [ ] **Step 1: `structureMarkerRenderer`** (smallest surface, fewest
  tests touched). Follow T9's Step 1–4 shape: failing buffer-spy test
  → migrate → strip from type → green.
- [ ] **Step 2: `filamentRenderer`.** Same shape.
- [ ] **Step 3: `pointRenderer`.** Same shape. This is the biggest test
  suite (775 lines per post-mortem); expect more test updates.
- [ ] **Step 4: Label renderers.** Per ADR 0001 §Decision "explicitly
  not deciding" clause: if label fade GPU shape differs from
  per-handle (e.g. per-character MSDF opacity), label renderers may
  opt out. Decide here; if opting out, document why in a follow-up
  comment on this plan and skip Step 4.
- [ ] **Step 5: After each migration, run full test + typecheck +
  visual smoke** before starting the next renderer.

---

## Task 11: Call `flushGpu` from `runFrame`

**Files:**
- Modify: `src/services/engine/frame/runFrame.ts`.

Per ADR 0001 §Decision item 4.

- [ ] **Step 1: Failing test.** Add a test asserting the call order
  inside `runFrame`: `fades.tick(now)` → `fades.flushGpu(now)` →
  first renderer `draw`. Use spies on the fade registry handle.
- [ ] **Step 2: Add the call.** One line after the existing
  `fades.tick(now)`.
- [ ] **Step 3: Tests green; typecheck clean.**

---

## Task 12: Update conventions doc

**Files:**
- Modify: `docs/superpowers/conventions/renderers.md`.

- [ ] **Step 1: Remove the "scalarVolumeRenderer mirror state" bullet**
  from the "Known outliers" section. Replace with a one-line note
  pointing at this plan as the resolution (so a reader doing
  archaeology can find the change rationale).
- [ ] **Step 2: Add a new section** "Fade and other cross-cutting
  subsystems" linking to ADR 0001. Three to five sentences. The point
  is to give future renderer authors a single pointer.
- [ ] **Step 3: Update CLAUDE.md** with the one-line entry from ADR
  0001 §Consequences:
  > Cross-cutting subsystems own their GPU resources end-to-end.
  > Renderers consume them by typed query (e.g.
  > `fades.bindGroupFor(handle)`), never by storing subsystem-
  > allocated buffers in their own per-instance state.

---

## Task 13: Full-feature smoke test

**Files:** none (manual / dev-server).

- [ ] **Step 1: Reload the dev server.** Confirm initial bootstrap
  has no console errors related to volumes or fade.
- [ ] **Step 2: CF-4 density.** Toggle on/off; tune contrast, density,
  envelope, exposure, trim via SettingsPanel. Each change should
  reflect on the next frame (verifies the projection picks up
  settings without a renderer-side setter).
- [ ] **Step 3: MCPM.** Same set of tunables; switch palettes (T7);
  confirm visual change.
- [ ] **Step 4: Fade choreography.** Switch source tiers (Small ↔
  Medium ↔ Large) and observe the fade-out / fade-in tween on the
  volumes. Should match pre-plan visual behavior — same easing, same
  duration, just owned by the registry.
- [ ] **Step 5: Concurrent fade-and-tune.** Start a fade, mid-fade
  drag the intensity slider. Both should compose smoothly.
- [ ] **Step 6: Filaments + points + clusters.** Verify other
  renderers migrated in T10 still fade correctly (load/unload tier,
  toggle filaments, etc.).
- [ ] **Step 7: Final `npm test` + `npm run typecheck`.** Both green.
  Note the test count vs Task 0 baseline; expect ~30–60 added tests
  net (from T2, T4–T11).

If any visual regression appears, STOP and report — do not
"polish later."

---

## Out of scope (deferred)

To keep this plan bite-sized and the diff reviewable, the following
adjacent improvements identified in the post-mortem are explicitly
deferred to follow-on plans:

- **Source-registry factory** for auto-generating fetcher + slot +
  UI rows from a single `SOURCE_REGISTRY` entry. (Track C item 5 in
  the architecture review chat.)
- **Render-graph / frame-graph** restructuring of `runFrame.ts` and
  the pass DAG. (Track B item 1.)
- **Settings schema with auto-generated UI** for VolumeFieldRow's
  seven sliders. (Loose end #8 in the post-mortem.)
- **Half-res offscreen ↔ post-process resize coupling** type-
  enforcement. (Loose end #13.)
- **Selection / picking GPU resource migration** to its subsystem
  (parallel to fade per ADR 0001's "not deciding" clause).

Each of these gets its own ADR + plan when prioritised against the
roadmap.

## Definition of Done

Before this plan can be marked complete:

- [ ] All tasks 0–13 checkboxes ticked.
- [ ] `npm test` green; test count increased by 30+ from baseline.
- [ ] `npm run typecheck` green.
- [ ] `FieldEntry` has 5 properties (down from 12).
- [ ] `ScalarVolumeRenderer` has no per-property setters
  (`setIntensity`, `setContrast`, …) — only `addField`,
  `removeField`, `draw`, and `destroy`.
- [ ] No renderer's per-instance type contains `fadeBuffer` or
  `fadeBindGroup`.
- [ ] No `TODO` / `FIXME` left in modified files (or, if needed,
  each carries `(owner, YYYY-MM-DD)` per the post-mortem's process
  recommendation).
- [ ] CLAUDE.md updated with the cross-cutting-subsystems convention.
- [ ] Conventions doc outlier note removed.
- [ ] Manual smoke (Task 13) shows no visual regression vs the
  pre-plan dev server.
