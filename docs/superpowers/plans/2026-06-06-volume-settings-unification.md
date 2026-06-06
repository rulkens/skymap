# Volume Settings Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move per-field volume settings out of the data layer (`state.data.volumes`) into the settings layer (`state.settings.volumes.fields`), dissolve the volume store, and make the scalar-volume renderer read settings per frame instead of mirroring them.

**Architecture:** The settings layer owns the seven per-field volume knobs (`enabled, intensity, contrast, densityScale, paletteId, trim, exposure`) under `state.settings.volumes.fields`, seeded at construction from `SOURCE_REGISTRY` like every other setting. Bespoke copy-on-write setters write that one home (clamps moved to the setter boundary); the renderer reads each field's knobs per frame via a new `draw(settingsOf)` projection and owns only GPU residency + per-cube static config + `residentPaletteId`. `state.data.volumes` is deleted.

**Tech Stack:** TypeScript, WebGPU, Vitest; engine in `src/services/engine`, renderer in `src/services/gpu/renderers`.

> **Executor notes.** `npm test` / `npm run typecheck` run on the main thread (background subagents can't run npm/npx). Commits use the user's git identity — never `--author`; stage specific paths, never `git add -A`. End every commit message with the trailer:
> `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

The verified edit surface (from the spec's "Edit surface (verified call sites)"):

**Settings home + seed**
- `src/@types/settings/EngineSettingsState.d.ts` — add `volumes.fields`; drop the false "live on the volume store, not here" carve-out comment (`:130-131`).
- `src/services/engine/engine.ts:342` — construction seed of `state.settings.volumes`.
- `src/services/engine/engine.ts:604-606` — the bulk `seedVolumeFields()` writer loop (repoint).

**Write path (engine setters)**
- `src/services/engine/engine.ts` — the 7 per-field setters (`setVolumeFieldEnabled` `:994`, `setVolumeFieldIntensity` `:1015`, `setVolumeFieldContrast` `:1023`, `setVolumeFieldDensityScale` `:1031`, `setVolumeFieldTrim` `:1039`, `setVolumeFieldExposure` `:1047`, `setVolumeFieldPalette` `:1055`); `addVolumeField` `:921-955`; `removeVolumeField` `:957-962`; `listVolumeFields` `:1063`; the `volumes` sub-handle surface `:1294` (unchanged in shape).
- New clamp helpers (small pure functions; one file each — single-function-file convention).

**Renderer**
- `src/services/gpu/renderers/scalarVolumeRenderer.ts` — `FieldEntry` slim; `draw(settingsOf)`; delete value setters; reactive palette via `residentPaletteId`; `addField` reads per-cube static config from `SOURCE_REGISTRY`.
- `src/@types/rendering/FieldEntry.d.ts` — slim.
- `src/@types/rendering/ScalarVolumeRenderer.d.ts` — new `draw` signature; removed setters; narrowed/removed `__getFieldEntryForTest`.

**Frame loop**
- `src/@types/engine/frame/EncodeVolumesArgs.d.ts` — add `settingsOf`.
- `src/services/engine/frame/encodeVolumes.ts:78` — pass `settingsOf` into `draw`.
- `src/services/engine/frame/encodeHdrSingle.ts:73-82` and `src/services/engine/frame/encodeHdrSplit.ts` — build `settingsOf` alongside `fadeOpacityOf`.

**Readers / demand / slots**
- `src/services/engine/helpers/buildVolumeFieldsSnapshot.ts:34-37` — derive from settings.
- `src/services/engine/wiring/demandCtx.ts:40` — repoint `volumeField`.
- `src/services/loading/slots/cf4DensitySlot.ts`, `mcpmSlot.ts`, `syntheticVolumeSlots.ts` — drop the setParams + 7-setter replay.

**Store deletion**
- `src/services/engine/data/createVolumeStore.ts` (delete), `src/@types/engine/data/VolumeStore.d.ts` (delete), `src/@types/engine/data/EngineData.d.ts:3,19` (drop `volumes`), `src/services/engine/data/createEngineData.ts:4,15` (drop `volumes`).
- `src/data/volumeFieldDefaults.ts:82-105` — `seedVolumeFields` docblock → "seed `state.settings.volumes.fields`".

**Tests mirroring the above**
- `tests/services/engine/wiring/settingsTable.test.ts` (frozen `SettingsTableKey` at 15 — unchanged).
- `tests/services/gpu/renderers/scalarVolumeRenderer.test.ts`, `tests/services/engine/helpers/`, `tests/services/engine/wiring/demandCtx.test.ts`, `tests/services/engine/data/createEngineData.test.ts`, `tests/services/engine/data/createVolumeStore.test.ts` (delete), `tests/services/engine/wiring/demandTable.test.ts`, `tests/services/engine/phases/wireSlots.test.ts`.

---

## Step 1 · Settings home + construction seed + snapshot (additive — store still present)

The build stays green through this whole step: settings gains `fields` alongside the still-live store, the seed populates both, and the snapshot flips its value-source to settings.

### Task 1.1 — Add `volumes.fields` to the settings type

**Files:** `src/@types/settings/EngineSettingsState.d.ts` (modify).

**Signature:**
```ts
volumes: {
  masterEnabled: boolean;                              // unchanged
  fields: Record<VolumeFieldId, VolumeFieldSettings>;  // NEW
};
```

- [x] Add the `fields` member to the `volumes` cluster; import `VolumeFieldId` (`@types/data/VolumeFieldId`) and `VolumeFieldSettings` (`@types/settings/VolumeFieldSettings`). (Typed `Partial<Record<…>>` — see commit `d729f0bc`.)
- [x] Rewrite the `volumes` docblock (`:126-134`): drop "Per-field params … live on the volume store (`state.data.volumes`), not here" — state that per-field params now live here in `fields`, seeded from `SOURCE_REGISTRY` at construction.
- [x] `npm run typecheck` → expected FAIL: the construction literal at `engine.ts:342` is missing `fields`, and `makeState()` in `tests/services/engine/wiring/settingsTable.test.ts:62` is missing `fields`. (Combined with 1.2 into one green commit.)
- [x] Commit: `feat(settings): add volumes.fields to EngineSettingsState` (combined with 1.2 as `d729f0bc`).

### Task 1.2 — Seed `volumes.fields` at construction; repoint the bulk seed loop

**Files:** `src/services/engine/engine.ts` (modify, `:342` + `:604-606`), `tests/services/engine/wiring/settingsTable.test.ts` (modify, `makeState` `:62`).

The bulk seed loop (`engine.ts:604-606`) is the "line 605 writer the spec flagged": it iterates `seedVolumeFields()` and writes each into `state.data.volumes.setParams(...)`. It moves into the construction literal as the `fields` seed (the store write is deleted in Step 3).

- [x] In `tests/services/engine/wiring/settingsTable.test.ts`, extend `makeState().settings.volumes` to `{ masterEnabled: false, fields: {} }` so the fixture type-checks (the table itself doesn't touch `fields`). Also fixed `tests/@types/engineState.test.ts` (3 sites) which the plan missed.
- [x] In `engine.ts:342`, seed `fields` inline from `seedVolumeFields()` — e.g. `volumes: { masterEnabled: DEFAULT_VOLUMES_ENABLED, fields: seedVolumeFields() }`. Import `seedVolumeFields` from `src/data/volumeFieldDefaults`. (`seedVolumeFields()` returns a `Partial<Record<…>>`; DEV-only debug fixtures are absent by design — matches today's store seed.)
- [x] Delete the `for (… seedVolumeFields()) state.data.volumes.setParams(…)` loop at `:604-606` AND its `// ── Seed the volume store …` comment block (`:596-603`). The store seed is now redundant with the settings seed; the store itself is deleted in Step 3.
- [x] `npm run typecheck` → expected PASS for the settings literal; the store still exists so its readers still compile.
- [x] `npm test -- settingsTable` → expected PASS (frozen key test still 15; `makeState` now type-checks).
- [x] Commit: `feat(engine): seed state.settings.volumes.fields at construction` (combined with 1.1 as `d729f0bc`).

### Task 1.3 — Snapshot derives values from settings

**Files:** `src/services/engine/helpers/buildVolumeFieldsSnapshot.ts` (modify, `:28-50`), `tests/services/engine/helpers/buildVolumeFieldsSnapshot.test.ts` (create).

**Behaviour:** the per-field `field` lookup reads `state.settings.volumes.fields[id]` instead of `state.data.volumes.params(id)`. Identity (`ids`) keeps reading `scalarVolumeRenderer.listHandles()` for now — the identity flip to settings keys is Task 4.3 (so Step 1 stays purely additive and the snapshot still shows only GPU-resident fields until then). Label still from `getVolumeFieldDefaults(id)`.

- [x] Add test `derives field values from state.settings.volumes.fields` — given a state whose `settings.volumes.fields['mcpm']` has `{ contrast: 3, intensity: 0.2, … }` and a renderer reporting handle `'mcpm'`, assert the row carries `contrast === 3` and `intensity === 0.2` (i.e. the value comes from settings, not the store). (4 tests added incl. fallback + empty cases.)
- [x] `npm test -- buildVolumeFieldsSnapshot` → expected FAIL (helper still reads the store).
- [x] Repoint the `field` lookup to `state.settings.volumes.fields[id]`; keep the `?? defaults` fallbacks. Update the module docblock (`:13-16`): "merges the renderer's live handle list with the per-field bag from `state.settings.volumes.fields`".
- [x] `npm test -- buildVolumeFieldsSnapshot` → expected PASS.
- [x] Commit: `refactor(volumes): snapshot reads field values from settings` (`dba6acee`).

---

## Step 2 · Engine setters + demand predicate repoint; renderer reads settings via `draw(settingsOf)`

After this step the renderer no longer holds the seven tunables, every setter writes only settings, and the frame loop hands the renderer a `settingsOf` projection. The store is still present (deleted in Step 3) but the engine setters and demand predicate no longer write/read it.

### Task 2.1 — Clamp helpers at the setter boundary

**Files:** `src/utils/clampVolumeContrast.ts`, `clampVolumeDensityScale.ts`, `clampVolumeExposure.ts`, `clampVolumeTrim.ts`, `clampVolumeIntensity.ts` (create — single-function files, filename = export name), `tests/utils/clampVolume.test.ts` (create).

The clamp policy lives today inside the renderer setters (`scalarVolumeRenderer.ts:438-503`) — `ScalarVolumeRenderer.d.ts:45` and the code already disagree on the contrast bound, which is the drift this consolidation removes. Move the policy to one home (the setter boundary).

**Signatures (all `(value: number) => number`):**
- `clampVolumeContrast` — `Math.max(0.05, Math.min(16, x))` (the live renderer bound at `:445`; the `.d.ts:42-45` "[0.25, 4.0] / 1e-3" text is stale — this helper is the new single source of truth).
- `clampVolumeDensityScale` — `Number.isFinite(x) && x > 0 ? x : 0` (`:499`).
- `clampVolumeExposure` — `Number.isFinite(x) ? Math.max(0, Math.min(32, x)) : 1.0` (`:465-466`).
- `clampVolumeTrim` — `Number.isFinite(x) ? Math.max(0, Math.min(0.95, x)) : 0.0` (`:471-472`).
- `clampVolumeIntensity` — `Math.max(0, Math.min(1, x))` (`:503`).

- [x] Add `tests/utils/clampVolume.test.ts` with one test per helper asserting: in-range pass-through, above-cap clamp, below-floor clamp, and (where applicable) NaN → the documented fallback. Name them e.g. `clampVolumeContrast clamps to [0.05, 16] and passes mid-range`, `clampVolumeExposure maps NaN to 1.0`. (32 tests.)
- [x] `npm test -- clampVolume` → expected FAIL (helpers don't exist).
- [x] Implement the five helpers, one per file. (`paletteId` and `enabled` need no clamp.)
- [x] `npm test -- clampVolume` → expected PASS.
- [x] Commit: `feat(volumes): extract per-knob clamp helpers` (`56971051`).

### Task 2.2 — Rewrite the 7 per-field engine setters (copy-on-write settings)

**Files:** `src/services/engine/engine.ts` (modify, `:994-1061`), `tests/services/engine/volumeFieldSetters.test.ts` (create).

Each setter mirrors the `setCategoryLabelVisible` copy-on-write shape at `engine.ts:1262`: guard on a missing row, replace `state.settings.volumes.fields` with a spread copy carrying the one clamped leaf, echo `cb.volumes?.onFieldsChanged?.(buildVolumeFieldsSnapshot(state))`, `requestRender()`. **No renderer value-call** — the six non-palette knobs need none (`draw` reads them) and palette re-upload is reactive (Task 2.5). `setVolumeFieldEnabled` additionally keeps its `fades.fadeTo` kick and its `maybeLazyLoadDebugVolume` call (`:1002,1006-1010`).

**Sketch (one setter; the rest mirror it):**
```ts
function setVolumeFieldContrast(id, contrast) {
  const cur = state.settings.volumes.fields[id]; if (!cur) return;
  state.settings.volumes.fields = {
    ...state.settings.volumes.fields,
    [id]: { ...cur, contrast: clampVolumeContrast(contrast) },
  };
  cb.volumes?.onFieldsChanged?.(buildVolumeFieldsSnapshot(state));
  state.subsystems.scheduler.requestRender();
}
```

- [x] **Deviation (testability):** `createEngine` is not test-bootable in the suite (needs a real GPU device; no test instantiates it), so the planned "build the engine + spy renderer" assertions aren't runtime-achievable. Instead extracted the copy-on-write core into a pure `src/services/engine/helpers/writeVolumeFieldSetting.ts` (removes the 7× duplication) and tested THAT in `tests/services/engine/helpers/writeVolumeFieldSetting.test.ts`: single-knob patch preserves the rest; new-reference copy-on-write (input unmutated); unknown id → `null`; pre-clamped value (`clampVolumeContrast(99)===16`) lands verbatim. The closure-level facts (snapshot echo, requestRender, NO renderer call, fade kick) are verified by the spec reviewer reading the diff.
- [x] `npm test` (writeVolumeFieldSetting) → FAIL→PASS via TDD.
- [x] Rewrite all 7 setters to delegate to `writeVolumeFieldSetting` + apply the Task 2.1 clamp helpers. Dropped every `state.data.volumes.params/setParams` line and every `state.gpu.scalarVolumeRenderer?.set*` value-call from these setters. Kept the `setVolumeFieldEnabled` fade + lazy-load lines.
- [x] `npm test -- writeVolumeFieldSetting` → PASS (4 tests); typecheck PASS.
- [x] Commit: `refactor(engine): volume setters write settings, not the store + renderer` (`9e8f6d46`).

### Task 2.3 — `addVolumeField` / `removeVolumeField` repoint to settings rows

**Files:** `src/services/engine/engine.ts` (modify, `:921-962`), `tests/services/engine/volumeFieldSetters.test.ts` (extend).

`addVolumeField` (`:921`): ensure a settings row exists (seed from `buildVolumeFieldSettings(fieldId)` if absent), call `renderer.addField(fieldId, cube)`, drive the fade from the (settings) `enabled` bit, echo snapshot + `requestRender`. Drop the seven `renderer.set*` replay lines (`:935-941`) — `draw` reads settings now. `removeVolumeField` (`:957`): `renderer.removeField(fieldId)`, delete the settings row (copy-on-write — `const { [id]: _, ...rest }` then assign), echo + `requestRender`.

- [x] **Deviation (same as 2.2):** engine not test-bootable, so the copy-on-write *delete* (the bug-prone bit) is extracted to a pure `removeVolumeFieldSetting` helper (symmetric with `writeVolumeFieldSetting`) and tested in `tests/services/engine/helpers/removeVolumeFieldSetting.test.ts`: removes row + new ref; input unmutated; absent-id no-op returns new ref. `addVolumeField`'s ensure-if-absent is inline copy-on-write (closure-level, review-verified).
- [x] `npm test` (removeVolumeFieldSetting) → FAIL→PASS via TDD (3 tests).
- [x] Rewrite both functions; the settings-row delete is copy-on-write (helper spreads then deletes the COPY, never the live object). Updated the inline comments to current behaviour.
- [x] Grep-verified engine.ts has ZERO `state.data.volumes` and ZERO `scalarVolumeRenderer?.set*` references.
- [x] Commit: `refactor(engine): add/removeVolumeField own settings rows, not the store` (`d7937b39`).

### Task 2.4 — Demand predicate reads settings

**Files:** `src/services/engine/wiring/demandCtx.ts` (modify, `:40`), `tests/services/engine/wiring/demandCtx.test.ts` (modify).

**Change:** `volumeField: (id) => state.data.volumes.params(id)` → `(id) => state.settings.volumes.fields[id]`. The `DemandCtx.volumeField` type signature is unchanged (still returns `VolumeFieldSettings | undefined`); update the `:38-39` comment ("Volume params live on the volume store" → "… on `state.settings.volumes.fields`").

- [x] Added test `volumeField reads field settings from state.settings.volumes.fields` (enabled-flip live-by-reference) + `volumeField returns undefined for an unregistered id`. Adjusted `demandCtx.test.ts` fixture from a `data.volumes` stub to a `settings.volumes.fields` record.
- [x] `npm test -- demandCtx` FAIL→PASS via TDD.
- [x] Repointed the closure + comment.
- [x] `npm test -- demandCtx` + `demandTable` PASS (20 tests); demandTable fixture repointed from `createEngineData()`/`data.volumes.setParams` to `settings.volumes.fields`. Typecheck PASS (after a `noUncheckedIndexedAccess` `!` on the in-place mutation).
- [x] Commit: `refactor(volumes): demand predicate reads field settings` (`ff7be2d8`).

### Task 2.5 — Renderer: slim `FieldEntry`, `draw(settingsOf)`, reactive palette, static config in `addField`

> ✅ DONE — bundled green commit `658a3dfd` (with 2.6 + 3.1, which are typecheck-coupled: deleting the renderer setters breaks the slot callers until 3.1). Renderer impl + both `.d.ts` + test rewritten; `__getFieldEntryForTest` removed; renderer test switched from synthetic `'h'` to real `'mcpm'` handle (addField now reads the registry, which throws on unknown ids). 18 renderer/frame tests green.

**Files:** `src/services/gpu/renderers/scalarVolumeRenderer.ts` (modify), `src/@types/rendering/FieldEntry.d.ts` (modify), `src/@types/rendering/ScalarVolumeRenderer.d.ts` (modify), `tests/services/gpu/renderers/scalarVolumeRenderer.test.ts` (modify).

This is the largest task. Per the spec §3-§4:

**`FieldEntry` slim** — keeps `handle`; GPU resources (`volumeTexture`, `paletteTexture`, `uniformBuffer`, `bindGroup`, `fadeBuffer`, `fadeBindGroup`); matrices (`modelMatrix`, `invModelMatrix`); per-cube static (`contrastCenter`, `envelopeInner`, `envelopeOuter`); and **NEW** `residentPaletteId: ScalarFieldPaletteId`. **Removes** `enabled`, `intensity`, `contrast`, `densityScale`, `paletteId`, `trim`, `exposure`.

**`draw` signature** (`ScalarVolumeRenderer.d.ts:119-125` + impl `:534`):
```ts
draw(
  pass, viewProj, viewportPx, cameraPosWorld,
  settingsOf: (handle: ScalarFieldHandle) => VolumeFieldSettings | undefined,
  fadeOpacityOf: (handle: ScalarFieldHandle) => number,
): void;
```
Import `VolumeFieldSettings`. In the draw loop, `const s = settingsOf(e.handle); if (!s) continue;` then pack `s.intensity / s.densityScale / s.contrast / s.exposure / s.trim` into the scratch slots (`:577-584`) instead of `e.*`; the skip gate (`:566`) reads `s.enabled` / `s.intensity` instead of `e.enabled` / `e.intensity`. `e.contrastCenter / e.envelopeInner / e.envelopeOuter` stay from the entry (per-cube static).

**Reactive palette** — at the top of each field iteration in `draw`: `if (s.paletteId !== e.residentPaletteId) { writePaletteLut(e.paletteTexture, s.paletteId); e.residentPaletteId = s.paletteId; }`.

**`addField` reads static config** — fold the old `setEnvelope` / `setContrastCenter` work into `addField`: read the field's `SOURCE_REGISTRY` entry (`envelope.inner/outer`, `contrastCenter`, `paletteId`) and seed `entry.contrastCenter`, `envelopeInner/Outer`, and `residentPaletteId` (+ initial `writePaletteLut`) directly. The renderer already imports nothing field-specific; add `getVolumeFieldDefaults` from `src/data/volumeFieldDefaults` (it closes over `VolumeFieldId`, and handles are registry-known) — or read the registry entry the same way `volumeEntry` does. `addField`'s seed literal (`:367-415`) drops the seven removed fields.

**`hasActiveFields`** (`:514-524`) currently reads `e.intensity` / `e.enabled`. It has no `settingsOf` today; give it the same `settingsOf` parameter as `draw` (thread from the same call site — see Task 2.6) so it can gate on `settingsOf(e.handle)`. Update `ScalarVolumeRenderer.d.ts:106-117` accordingly.

**Delete** value setters `setEnabled`, `setIntensity`, `setContrast`, `setDensityScale`, `setTrim`, `setExposure`, `setEnvelope`, `setContrastCenter`, `setFieldPalette`, `getFieldPalette` from impl + `.d.ts`. **Remove** `__getFieldEntryForTest` from impl + `.d.ts` (tests move to settings + residency assertions — Task 4.1), OR narrow it to residency-only (`residentPaletteId` + matrices) if a residency test still needs it; prefer removal.

- [ ] Update `scalarVolumeRenderer.test.ts`: replace the `createScalarVolumeRenderer setters` block. Add `draw reads field values from settingsOf` — with a fake `settingsOf` returning `{ intensity: 0.9, contrast: 4, … }` for `'h'`, drive `draw` and assert the values reached `device.queue.writeBuffer` (inspect the scratch Float32Array slots: intensity at index 55, densityScale 56, contrast 57, exposure 61, trim 62 — see the layout comment at `:538-555`). Add `draw skips a field with no settings row` (`settingsOf → undefined`). Add `draw re-uploads the LUT once when settingsOf(id).paletteId changes` — first draw with `paletteId 'viridis'`, second with `'inferno'`, assert `writeTexture` called once more on the second draw and `residentPaletteId` tracks (via a residency accessor if retained, else via the `writeTexture` call count). Add `addField seeds contrastCenter / envelope / residentPaletteId from the registry`.
- [ ] `npm test -- scalarVolumeRenderer` → expected FAIL.
- [ ] Implement: slim `FieldEntry.d.ts` + its docblocks; new `draw` + `hasActiveFields` signatures in `.d.ts`; delete the listed setters from `.d.ts`; remove/narrow `__getFieldEntryForTest` in `.d.ts`. Then the impl: slim the `addField` seed literal + read static config from the registry; rewrite `draw` to read `settingsOf` + reactive palette; rewrite `hasActiveFields`; delete the setter methods. Update the module header (`:1-34`) and `:51-57` uniform-bytes comment if field names change (bytes don't).
- [ ] `npm test -- scalarVolumeRenderer` → expected PASS.
- [ ] Commit: `refactor(renderer): scalarVolume reads settings via draw(settingsOf)`.

### Task 2.6 — Thread `settingsOf` through the frame loop

> ✅ DONE — bundled green commit `658a3dfd`. Threaded `settingsOf` through `EncodeVolumesArgs` → `encodeVolumes` → `hasActiveFields`/`draw`, plus the two `encodeHdr*` call sites **and `volumeUpsamplePass.ts` — a 4th `hasActiveFields()` call site the plan missed** (now required since `settingsOf` is mandatory).

**Files:** `src/@types/engine/frame/EncodeVolumesArgs.d.ts` (modify), `src/services/engine/frame/encodeVolumes.ts` (modify, `:53,78-84`), `src/services/engine/frame/encodeHdrSingle.ts` (modify, `:69-82`), `src/services/engine/frame/encodeHdrSplit.ts` (modify — mirror site), `tests/services/engine/frame/encodeVolumes.test.ts` (modify).

`EncodeVolumesArgs` gains `settingsOf: (handle: ScalarFieldHandle) => VolumeFieldSettings | undefined` (import `VolumeFieldSettings`). `encodeVolumes` forwards it into both `hasActiveFields(settingsOf, fadeOpacityOf)` (`:53`) and `draw(pass, ctx.vp, [vw,vh], camPos, settingsOf, fadeOpacityOf)` (`:78-84`). At the call sites (`encodeHdrSingle.ts:73` and the `encodeHdrSplit` mirror) build `settingsOf` right beside `fadeOpacityOf`: `const settingsOf = (handle: string) => state.settings.volumes.fields[handle as VolumeFieldId];` and pass it through the `hasActiveFields` guard too.

- [ ] Update `encodeVolumes.test.ts`: pass a `settingsOf` in the args bag; assert it's forwarded into `draw` (the test mocks `scalarVolumeRenderer.draw` — assert it received the `settingsOf` arg) and that the `hasActiveFields`-false short-circuit still returns early.
- [ ] `npm test -- encodeVolumes` → expected FAIL (arg bag lacks `settingsOf`).
- [ ] Implement the type change + both call sites + `encodeVolumes` forwarding. Update the `:1-36` arg-bag docblock to document `settingsOf` next to `fadeOpacityOf`.
- [ ] `npm test -- encodeVolumes` → expected PASS.
- [ ] `npm run typecheck` → expected PASS (renderer + frame loop now agree on the new `draw` / `hasActiveFields` shape).
- [ ] Commit: `refactor(frame): thread settingsOf into the volume pass`.

---

## Step 3 · Repoint slot commits; delete the volume store

The store has no remaining engine/demand/snapshot/renderer readers after Step 2 — only the three slot commits still write it. Repoint them, then delete the store last.

### Task 3.1 — Slot commits drop the setParams + 7-setter replay

> ✅ DONE — bundled green commit `658a3dfd`. cf4/mcpm/synthetic commits now `addField` + (settings-row ensure, synthetic only) + fade-from-settings-enabled + snapshot echo; no store write, no setter replay. wireSlots fixture seeded with `settings.volumes.fields` so mcpm's demand fires.

**Files:** `src/services/loading/slots/cf4DensitySlot.ts` (modify, `:43-73`), `mcpmSlot.ts` (modify, `:35-63`), `syntheticVolumeSlots.ts` (modify, `:90-119`), their tests if present (`tests/services/loading/slots/` — none exist for these three today; the `wireSlots.test.ts` integration test exercises them).

Each commit currently: `addField` → seed/preserve store row → read `persisted` → replay 7 renderer setters (+ `setEnvelope`/`setContrastCenter`) → fade kick → snapshot echo. After this task: ensure the **settings** row exists (`addVolumeField`'s construction seed already created it for cf4/mcpm; synthetic fixtures have no construction seed so seed it: `if (!state.settings.volumes.fields[handle]) state.settings.volumes.fields = { ...state.settings.volumes.fields, [handle]: buildVolumeFieldSettings(handle) };`) → `renderer.addField(handle, cube)` (which now seeds static config + palette from the registry itself, Task 2.5) → fade kick from `state.settings.volumes.fields[handle].enabled` → snapshot echo + `requestRender`. Drop the entire `persisted`/`renderer.set*`/`setEnvelope`/`setContrastCenter` block.

- [ ] `npm test -- wireSlots` → run first to capture the current green baseline.
- [ ] Rewrite all three commits to the slimmed shape. cf4/mcpm read `enabled` from `state.settings.volumes.fields[handle]`; synthetic seeds the settings row first (DEV-only). Remove the now-unused `buildVolumeFieldSettings` import from cf4/mcpm only if the seed-guard is dropped there (keep it in `syntheticVolumeSlots`). Update each commit's docblock to current behaviour.
- [ ] `npm test -- wireSlots` → expected PASS.
- [ ] `npm run typecheck` → at this point `state.data.volumes` still exists, so no break yet.
- [ ] Commit: `refactor(slots): volume commits seed settings, not the store + replay`.

### Task 3.2 — Delete the volume store

> ✅ DONE — commit `dcd3039b`. Deleted `createVolumeStore.ts` + `VolumeStore.d.ts` + its test; dropped `volumes` from `EngineData`/`createEngineData`; pruned the dead store seed + nine stale renderer-setter mock entries from `wireSlots.test.ts`. Typecheck + suites green.

**Files:** delete `src/services/engine/data/createVolumeStore.ts` and `src/@types/engine/data/VolumeStore.d.ts`; modify `src/@types/engine/data/EngineData.d.ts` (`:3,19`), `src/services/engine/data/createEngineData.ts` (`:4,15`); delete `tests/services/engine/data/createVolumeStore.test.ts`; modify `tests/services/engine/data/createEngineData.test.ts`.

- [ ] Remove `volumes` from `EngineData` (`:19`) and drop its `import` (`:3`); update the `EngineData` docblock (`:8-15`) — it currently claims volumes is a thin store and references `state.settings.volumes.fields`; rewrite to the three remaining stores (galaxies, structures, filaments) and note volumes moved to settings (ADR 0006).
- [ ] Remove `volumes: createVolumeStore()` and its import from `createEngineData.ts`.
- [ ] Delete `createVolumeStore.ts`, `VolumeStore.d.ts`, and `createVolumeStore.test.ts`.
- [ ] Update `tests/services/engine/data/createEngineData.test.ts` — drop any `volumes`-store assertion; assert the bag now has exactly `galaxies`/`structures`/`filaments`.
- [ ] `npm run typecheck` → expected PASS (no remaining `state.data.volumes` reader — verify by searching; if any survives, it's a missed repoint).
- [ ] `npm test -- createEngineData` → expected PASS.
- [ ] Commit: `refactor(volumes): dissolve the volume store (ADR 0006)`.

---

## Step 4 · Snapshot identity from settings; finish docs + dead-test cleanup

### Task 4.1 — Snapshot identity derives from settings keys

> ✅ DONE — commit `62979337`. `buildVolumeFieldsSnapshot` + `listVolumeFields` derive ids from `Object.keys(state.settings.volumes.fields)`; renderer dependency gone. Renderer-empty tests folded to settings-empty; the now-unreachable defaults-fallback test dropped (id from keys ⇒ value always present).

**Files:** `src/services/engine/helpers/buildVolumeFieldsSnapshot.ts` (modify, `:34`), `src/services/engine/engine.ts` (modify, `listVolumeFields` `:1063`), `tests/services/engine/helpers/buildVolumeFieldsSnapshot.test.ts` (extend).

**Change:** `ids` derives from `Object.keys(state.settings.volumes.fields)` instead of `scalarVolumeRenderer.listHandles()` — killing the split-brain (identity from GPU, values from settings). `listVolumeFields` (`engine.ts:1063`) likewise returns the settings keys, not the renderer handles.

- [ ] Add test `snapshot identity derives from settings keys, not renderer handles` — a state whose `settings.volumes.fields` has `'mcpm'` and `'cf4-density'` but whose renderer `listHandles()` returns only `'mcpm'` (cube not yet loaded) produces **two** rows. This is the intended behaviour change: the panel can show CF-4's toggle before its cube loads.
- [ ] `npm test -- buildVolumeFieldsSnapshot` → expected FAIL (identity still from the renderer).
- [ ] Repoint `ids` to the settings keys (cast to `VolumeFieldId[]`); drop the renderer-handle read + its narrowing comment. Repoint `listVolumeFields`. Update the snapshot docblock — identity AND values now from settings; the renderer dependency is gone.
- [ ] `npm test -- buildVolumeFieldsSnapshot` → expected PASS.
- [ ] Commit: `refactor(volumes): snapshot identity derives from settings keys`.

### Task 4.2 — Docblock sweep + dead-test removal

> ✅ DONE — commit `db2a60c4`. Swept 8 stale docblock/comment sites (`VolumeFieldSettings.d.ts`, `volumeFieldDefaults.ts` incl. the "Task 11b" note, `DemandCtx.d.ts`, `EngineVolumesHandle.d.ts`'s `setEnvelope` ref, `assetWiring.ts`, three test files) to point at `state.settings.volumes.fields`; removed the dead `data.volumes` stub from the snapshot test. Zero remaining "volume store" / `state.data.volumes` references except the intentional `EngineData.d.ts:15` supersession note.

**Files:** `src/data/volumeFieldDefaults.ts` (modify, `:82-105`), `src/@types/settings/VolumeFieldSettings.d.ts` (modify, `:5-8`), any remaining stale comments surfaced while editing.

- [ ] `volumeFieldDefaults.ts` — `seedVolumeFields`'s docblock (`:82-94`) says "The engine populates the volume store (`state.data.volumes`) …" → "The engine seeds `state.settings.volumes.fields` …". The "Task 11b" reference in `buildVolumeFieldSettings` (`:64`) is a stale history note — drop it (comment-style: no history notes).
- [ ] `VolumeFieldSettings.d.ts` docblock (`:5-8`) — "Held by the volume store (`state.data.volumes`) …" → "Held in `state.settings.volumes.fields` …". The `paletteId` field comment (`:36-42`) says it "mirrors the renderer's per-field palette" — reword: it's the authoritative palette; the renderer's `residentPaletteId` tracks it.
- [ ] Grep for any surviving `state.data.volumes` / `volume store` mention in src comments and fix in place (don't gold-plate unrelated files).
- [ ] `npm run typecheck` + `npm test` → expected PASS (docs-only; no behaviour change).
- [ ] Commit: `docs(volumes): point docblocks at settings.volumes.fields`.

### Task 4.3 — Full-suite verification

> ✅ DONE — commit `e357c9e6`. `npm run typecheck` (src + tools) PASS; full `npm test` = **2351 tests across 371 files, all green**; grep confirms ZERO references to `state.data.volumes`, `createVolumeStore`, `VolumeStore`, `__getFieldEntryForTest`, or any deleted renderer setter. Two architecture-guard tests corrected for the ADR 0006 reversal (forbiddenPaths un-bans `settings.volumes.fields`; renderFrame baseline records the new `draw(settingsOf, fadeOpacityOf)` signature).

**Files:** none (verification gate).

- [ ] `npm run typecheck` → expected PASS (both src + tools tsconfigs).
- [ ] `npm test` → expected PASS (full single pass; ~590+ tests green; no `createVolumeStore` suite, frozen `SettingsTableKey` still 15).
- [ ] Confirm via grep that `state.data.volumes`, `VolumeStore`, `createVolumeStore`, and the deleted renderer setters (`setFieldPalette`, `setContrastCenter`, `setEnvelope`, `setEnabled`/`setIntensity`/`setContrast`/`setDensityScale`/`setTrim`/`setExposure` on the volume renderer) have **zero** references in `src/` and `tests/`.
- [ ] No commit (or a trailing `chore: …` only if a stray fix was needed).

---

## Done when

- The seven per-field tunables live only in `state.settings.volumes.fields`; `state.data.volumes` is gone.
- The renderer holds no settings mirror — `FieldEntry` has GPU resources + matrices + per-cube static + `residentPaletteId`, and `draw(settingsOf)` reads the knobs each frame.
- `buildVolumeFieldsSnapshot` derives identity **and** values purely from settings.
- No user-visible behaviour change; `npm test` + `npm run typecheck` green; frozen `SettingsTableKey` unchanged at 15.
