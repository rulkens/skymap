# Volume Settings Unification — design spec

> **Status.** Design — approved 2026-06-06. Implements
> [ADR 0006](../../adrs/0006-volume-field-settings-in-settings-layer.md).
> The *why* lives in ADR 0006 + [`simplicity.md`](../conventions/simplicity.md);
> this spec carries the *what* and the edit surface. The TDD task list lives in
> the companion plan.

## Goal

Move per-field volume settings out of the data layer (`state.data.volumes`) into
the settings layer (`state.settings.volumes.fields`), **dissolve the volume
store**, and make the scalar-volume renderer read settings per frame instead of
mirroring them. After this, volume settings relate to every other setting
identically: one home, one write path, React + renderer derived.

**Done =** the seven per-field tunables live in exactly one place
(`state.settings.volumes.fields`); the renderer holds no settings mirror; the
SettingsPanel snapshot derives purely from settings; **no user-visible behaviour
change**; tests green; typecheck green.

## Background — the braid we're removing

Today a single value such as a field's `contrast` lives in two persistent homes —
`state.data.volumes` (`VolumeFieldSettings`) and the renderer's per-field
`FieldEntry` — kept equal by hand across seven double-writing setters plus the
boot and slot-commit replays, with a third *derived* React copy and a **split
identity source** (the snapshot reads field *ids* from the GPU renderer and
*values* from the store). The global `volumes.masterEnabled` already lives in
`state.settings.volumes`, so one feature's settings are split across two
subsystems. See ADR 0006 for the full diagnosis.

## Design

### 1 · Settings home

`EngineSettingsState.volumes` gains `fields`:

```ts
volumes: {
  masterEnabled: boolean;                              // unchanged
  fields: Record<VolumeFieldId, VolumeFieldSettings>;  // NEW
};
```

`VolumeFieldSettings` (`@types/settings/VolumeFieldSettings.d.ts`) is **unchanged**:
`{ enabled, intensity, contrast, densityScale, paletteId, trim, exposure }`. The
map is seeded at construction from the volume entries in `SOURCE_REGISTRY` via the
existing `buildVolumeFieldSettings(handle)`, so every registry-known field has a
settings row from boot (the panel can show CF-4's toggle before its cube
lazy-loads).

### 2 · Write path — bespoke copy-on-write setters

Each per-field setter writes one home and echoes a snapshot — the
`labelCategoryVisibility` precedent (`engine.ts:1262`):

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

- **No renderer value-call.** The six non-palette knobs need none; `draw` reads them.
- **Clamp/policy moves here** (one home for the *why*). Extract the per-knob clamps
  (today buried in the renderer setters, where `ScalarVolumeRenderer.d.ts` and the
  code already disagree on the contrast bound) into small pure helpers
  (e.g. `clampVolumeContrast`).
- `masterEnabled` stays on `SETTINGS_TABLE` (unchanged). Per-field setters stay
  **bespoke** (keyed settings don't fit the static table — same as category
  visibility); `SettingsTableKey` stays at 15 and its frozen test is unchanged.

### 3 · Renderer — read, don't store

`scalarVolumeRenderer.draw` gains `settingsOf`:

```ts
draw(
  pass, viewProj, viewportPx, cameraPosWorld,
  settingsOf: (handle: ScalarFieldHandle) => VolumeFieldSettings | undefined,
  fadeOpacityOf: (handle: ScalarFieldHandle) => number,
): void;
```

The per-field uniform pack reads `settingsOf(id)` exactly as it already reads
`fadeOpacityOf(id)`. `FieldEntry` (`@types/rendering/FieldEntry.d.ts`) slims to
what the renderer genuinely owns:

- **keeps:** `handle`; GPU resources (`volumeTexture`, `paletteTexture`,
  `uniformBuffer`, `bindGroup`, `fadeBuffer`, `fadeBindGroup`); matrices
  (`modelMatrix`, `invModelMatrix`); per-cube **static** config (`contrastCenter`,
  `envelopeInner`, `envelopeOuter`) applied once at `addField` from
  `SOURCE_REGISTRY`; and `residentPaletteId` (a GPU-residency fact — see §4).
- **removes:** `enabled`, `intensity`, `contrast`, `densityScale`, `paletteId`,
  `trim`, `exposure`.

Renderer surface changes (`ScalarVolumeRenderer.d.ts`):

- **Delete** the value setters `setEnabled`, `setIntensity`, `setContrast`,
  `setDensityScale`, `setTrim`, `setExposure`.
- **Delete** `setFieldPalette`; palette re-upload becomes reactive (§4).
- **Fold** `setEnvelope` / `setContrastCenter` into `addField` — they are per-cube
  static, read from `SOURCE_REGISTRY` at registration.
- **Remove** `__getFieldEntryForTest` (tests assert settings + GPU residency, not a
  settings mirror), or narrow it to residency-only.

### 4 · Palette — the one GPU-side-effect knob

`paletteId` is a setting, but changing it must re-upload the LUT texture.
**Reactive resolution:** the renderer keeps `residentPaletteId` per field (a
GPU-residency fact); in `draw`, when `settingsOf(id).paletteId !==
entry.residentPaletteId` it rewrites the LUT in place (`writeTexture`, bind group
stays valid) and updates `residentPaletteId`. This keeps **every** per-field
setter uniform (write-settings-only) and the renderer a pure function of *(cubes it
owns) × (settings handed in)* each frame. (Alternative considered and rejected: an
explicit `uploadPalette(id)` GPU command from the palette setter — makes palette
the one non-uniform setter for no real gain.)

### 5 · Field identity & lifecycle

- **Settings** owns "which fields exist (as settings)" — the registry-seeded keys of
  `state.settings.volumes.fields`.
- **Renderer** owns GPU residency — `addField` / `removeField` on cube load / unload
  (demand-driven, unchanged in spirit).
- The volume **demand predicate** repoints: `demandCtx.ts:40`
  `volumeField: (id) => state.data.volumes.params(id)` →
  `(id) => state.settings.volumes.fields[id]`.

### 6 · React snapshot — pure derivation

`buildVolumeFieldsSnapshot(state)` derives purely from
`state.settings.volumes.fields` (keys + values), dropping its
`scalarVolumeRenderer.listHandles()` dependency — killing the split-brain where
identity came from the GPU and values from the store. Label still from
`getVolumeFieldDefaults(id)`.

### 7 · Dissolve the store

Delete `createVolumeStore.ts`, the `VolumeStore` type, and `EngineState.data.volumes`
(`createEngineData.ts:15`). Repoint every reader (below) to
`state.settings.volumes.fields`.

## Type contracts (pinned by the plan)

- `EngineSettingsState.volumes.fields: Record<VolumeFieldId, VolumeFieldSettings>` (new).
- `ScalarVolumeRenderer.draw(..., settingsOf: (h) => VolumeFieldSettings | undefined, fadeOpacityOf)`.
- `FieldEntry` slimmed (§3).
- **Deleted:** `VolumeStore`, `createVolumeStore`, `EngineState.data.volumes`; the six
  renderer value setters + `setFieldPalette`; `setEnvelope` / `setContrastCenter`
  (folded into `addField`).

## Edit surface (verified call sites)

- `src/@types/settings/EngineSettingsState.d.ts` — add `volumes.fields`; drop the
  "live on the volume store, not here" carve-out comment (now false).
- **Construction seed** — `engine.ts:342` (`state.settings.volumes` literal): seed
  `fields` from the `SOURCE_REGISTRY` volume entries via `buildVolumeFieldSettings`.
- `src/services/engine/engine.ts` — rewrite the 7 per-field setters
  (`setVolumeField{Enabled,Intensity,Contrast,DensityScale,Trim,Exposure,Palette}`,
  ~`1000–1058`) to write `state.settings.volumes.fields` + echo + `requestRender`,
  no renderer value-call; `addVolumeField` boot seed (`929–941`) → ensure settings
  row + `renderer.addField` only; `removeVolumeField` (`959`) → drop the settings
  row + `renderer.removeField`; line `605` writer → repoint. The `volumes`
  sub-handle surface (`1294`) is unchanged.
- `src/services/engine/frame/encodeVolumes.ts:78` — pass `settingsOf` into
  `draw` (built alongside `fadeOpacityOf` from `state.settings.volumes.fields`).
- `src/services/gpu/renderers/scalarVolumeRenderer.ts` — `FieldEntry` slim;
  `draw(settingsOf)`; delete value setters; reactive palette via `residentPaletteId`;
  `addField` reads per-cube static config from the registry.
- `src/@types/rendering/FieldEntry.d.ts` — slim (§3).
- `src/@types/rendering/ScalarVolumeRenderer.d.ts` — new `draw` signature; removed setters.
- `src/services/engine/helpers/buildVolumeFieldsSnapshot.ts:36` — derive from
  `state.settings.volumes.fields`.
- `src/services/loading/slots/{cf4DensitySlot,mcpmSlot,syntheticVolumeSlots}.ts` —
  commit drops the `setParams` + 7-setter replay; just `addField` (the settings row
  already exists from the construction seed) + fade kick.
- `src/services/engine/wiring/demandCtx.ts:40` — repoint the `volumeField` reader.
- **Delete** `src/services/engine/data/createVolumeStore.ts`, the `VolumeStore`
  type, and `EngineState.data.volumes` (`createEngineData.ts:15`).
- `src/data/volumeFieldDefaults.ts` — its "build the volume store at construction"
  docblock updates to "seed `state.settings.volumes.fields`".
- Tests mirroring all of the above.

## Testing

- **Seed:** construction populates `state.settings.volumes.fields` from the registry
  (every volume `Source` has a row with its defaults).
- **Setter:** each per-field setter writes `fields` copy-on-write, echoes a snapshot,
  requests a render, and makes **no** renderer value-call; unknown id is a no-op.
- **Renderer reads settings:** `draw` renders from `settingsOf`, not internal state
  (assert via a fake `settingsOf` changing output without any setter call).
- **Palette reactive:** changing `paletteId` in settings triggers exactly one LUT
  re-upload on the next `draw`; `residentPaletteId` tracks.
- **Snapshot:** derives from settings only (no renderer handle dependency).
- **Demand:** toggling `enabled` flips the demand predicate's read.
- **Frozen `SettingsTableKey`** stays at 15.
- Remove / repurpose the `__getFieldEntryForTest` mirror-assertion tests.

## Sequencing (one plan)

No on-disk format change (settings aren't persisted to `.bin`). Suggested order:

1. Add `state.settings.volumes.fields` + construction seed; make
   `buildVolumeFieldsSnapshot` derive from settings (additive — store still present).
2. Repoint the 7 engine setters + the demand predicate to settings; add
   `draw(settingsOf)` and thread it from `encodeVolumes`; slim `FieldEntry`; reactive
   palette; `addField` reads static config.
3. Repoint the slot commits; delete `createVolumeStore` + `VolumeStore` +
   `EngineState.data.volumes`.
4. Delete the dead renderer setters + `__getFieldEntryForTest`; finish tests.

## Out of scope

- Renaming `labelCategoryVisibility` / `markerCategoryVisibility` (belongs to the
  POI-dissolution work, ADR 0005 §5).
- Generalising `SETTINGS_TABLE` for keyed settings.
- The other per-type stores (`galaxyStore`, `structureStore`, `filamentStore`).
- Demand-driven unload / GPU eviction (ADR 0005, parked).

## References

- [ADR 0006](../../adrs/0006-volume-field-settings-in-settings-layer.md) — the decision.
- [ADR 0005](../../adrs/0005-engine-data-layer-and-asset-loading.md) — the store this
  partially supersedes.
- [`simplicity.md`](../conventions/simplicity.md) — value × place, single source of truth.
