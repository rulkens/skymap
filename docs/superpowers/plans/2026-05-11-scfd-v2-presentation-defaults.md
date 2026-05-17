# SCFD v2 — Strip Presentation Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Each implementer subagent must be dispatched `run_in_background: true` per project convention. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move palette and densityScale out of the SCFD binary into a per-handle TypeScript registry. SCFD becomes purely descriptive (dims + frame + voxels + dynamic range); changing a default palette becomes a one-line code edit instead of a binary rebuild + R2 re-sync.

**Architecture:** Bump SCFD to **v2** — header drops `palette_id` byte (offset 22) and `density_scale` float (offset 64); those bytes return to `reserved`. A new module `src/data/volumeFieldDefaults.ts` maps known field handles (`'cf4-density'`, `'debug-gaussian'`, …) to `{ paletteId, densityScale, label? }`. `wireSlots` reads the registry when seeding settings instead of reading from `cube.paletteId` / `cube.densityScale`. The renderer's `addField` no longer pulls those fields from the cube — callers explicitly pass them via new/existing setters (`setFieldPalette` already exists; we add `setDensityScale`).

**No back-compat with v1.** The decoder rejects `version !== 2` with a "regenerate via `npm run build-cf4-density`" message — same precedent as the GalaxyCatalog / Filament binary decoders. Rolling out means regenerating `cf4_density.scfd` and re-syncing R2 in lockstep with the code deploy.

**Tech Stack:** TypeScript, Vitest. No new runtime deps.

**Spec:** This plan was approved conversationally in the 2026-05-11 session and supersedes any earlier SCFD design docs that imply palette is intrinsic to the cube.

**Done means:**

- `ScalarCube` type has no `paletteId` and no `densityScale` fields.
- SCFD v2 encoder produces files with both bytes zeroed in the reserved region; decoder accepts v2 only and rejects v1 with a clear regenerate message.
- `wireSlots`'s cf4Density + synthetic-volume commits read defaults from `VOLUME_FIELD_DEFAULTS[handle]` (with a sane fallback for unregistered handles).
- `tools/buildCf4Density.ts` no longer encodes palette/densityScale — the constants move to the registry.
- `public/data/cf4_density.scfd` is regenerated as a v2 file; R2 sync ships it as part of the rollout.
- `npm run typecheck`, `npm test`, `npm run build` all green.
- Smoke test for `buildCf4Density` no longer asserts `cube.paletteId` / `cube.densityScale` (because the type doesn't have them).
- An external reader implementing only the v2 spec gets a valid, decode-able cube with zero palette baggage.

---

## File structure

### New files

- `src/data/volumeFieldDefaults.ts` — `VOLUME_FIELD_DEFAULTS` registry + `FALLBACK_VOLUME_DEFAULTS`.
- `tests/data/volumeFieldDefaults.test.ts` — registry shape + fallback behavior.

### Modified files

- `src/data/scalarFieldFormat.ts` — bump `VERSION` to 2; encoder drops palette/scale writes; decoder handles both v1 and v2; remove `PALETTE_ID_TO_INDEX` / `INDEX_TO_PALETTE_ID` tables (palette is no longer a binary concern).
- `src/@types/ScalarCube.d.ts` — drop `paletteId` and `densityScale` fields.
- `src/data/syntheticScalarField.ts` — remove `paletteId` and `densityScale` from generator output and from option types.
- `src/services/gpu/renderers/scalarVolumeRenderer.ts` — `addField(handle, cube)` no longer reads `cube.paletteId` / `cube.densityScale`; `FieldEntry.densityScale` defaults to 1.0; add `setDensityScale(handle, value)` setter mirroring `setIntensity`. Existing `setFieldPalette` already covers palette.
- `src/@types/EngineHandle.d.ts` — add `setVolumeFieldDensityScale?: (handle, value) => void`.
- `src/services/engine/engine.ts` — wire `setVolumeFieldDensityScale` handler.
- `src/services/engine/phases/wireSlots.ts` — both volume commit sites (cf4Density + synthetic) read presentation defaults from `VOLUME_FIELD_DEFAULTS[handle]` and seed via `renderer.setFieldPalette` + `renderer.setDensityScale`.
- `tools/buildCf4Density.ts` — remove `DEFAULT_CF4_PALETTE`, `CF4_DENSITY_SCALE`, the `--palette` CLI flag, and the encoder call args for palette/scale. The 5.0 densityScale moves to the registry alongside `'cf4-density'`.
- `tests/data/scalarFieldFormat.test.ts` — v2 round-trip; v1 legacy decode still produces a valid cube (with palette/scale absent on the runtime type).
- `tests/tools/buildCf4Density.smoke.test.ts` — drop `cube.paletteId` and `cube.densityScale` assertions; keep voxel-mapping asserts.
- `tests/services/gpu/renderers/scalarVolumeRenderer.test.ts` — any cube fixtures that set `paletteId` / `densityScale` lose those fields; `setDensityScale` coverage added.
- `tests/data/syntheticScalarField.test.ts` — drop palette/scale assertions on generator output.
- `public/data/cf4_density.scfd` — regenerated via `npm run build-cf4-density`.

---

## Tasks

### Task 0: Pre-flight

**Files:** none modified.

- [ ] **Step 0.1: Verify baseline.**

Run:
```
npm run typecheck && npm test
```
Expected: typecheck clean, all tests pass. Record the test count for self-review at the end (today it's 1060).

- [ ] **Step 0.2: Confirm working tree is on a fresh branch off main.**

Run:
```
git status -sb && git log --oneline main..HEAD | head -5
```
Expected: working tree clean; either on a branch with no commits ahead of main yet, or on a branch dedicated to this plan.

---

### Task 1: Add the volume-field defaults registry

**Files:**
- Create: `src/data/volumeFieldDefaults.ts`
- Test: `tests/data/volumeFieldDefaults.test.ts`

- [ ] **Step 1.1: Write the failing test.**

```ts
// tests/data/volumeFieldDefaults.test.ts
import { describe, it, expect } from 'vitest';
import {
  VOLUME_FIELD_DEFAULTS,
  FALLBACK_VOLUME_DEFAULTS,
  getVolumeFieldDefaults,
} from '../../src/data/volumeFieldDefaults';

describe('volumeFieldDefaults', () => {
  it('exposes cf4-density with coolwarm + densityScale 5.0', () => {
    const d = VOLUME_FIELD_DEFAULTS['cf4-density'];
    expect(d).toBeDefined();
    expect(d!.paletteId).toBe('coolwarm');
    expect(d!.densityScale).toBeCloseTo(5.0, 6);
  });

  it('exposes debug-gaussian with a sensible synthetic-Gaussian densityScale', () => {
    const d = VOLUME_FIELD_DEFAULTS['debug-gaussian'];
    expect(d).toBeDefined();
    expect(d!.densityScale).toBeGreaterThan(0);
  });

  it('returns the fallback for unknown handles', () => {
    expect(getVolumeFieldDefaults('not-a-real-field')).toEqual(FALLBACK_VOLUME_DEFAULTS);
  });

  it('fallback paletteId is one of the registered palettes', () => {
    expect([
      'viridis', 'magma', 'blue-purple', 'yellow-green', 'coolwarm',
    ]).toContain(FALLBACK_VOLUME_DEFAULTS.paletteId);
  });
});
```

- [ ] **Step 1.2: Run; verify it fails.**

```
npx vitest run tests/data/volumeFieldDefaults.test.ts
```
Expected: fail with `Cannot find module '../../src/data/volumeFieldDefaults'`.

- [ ] **Step 1.3: Implement the registry.**

```ts
// src/data/volumeFieldDefaults.ts
/**
 * Per-handle presentation defaults for scalar-volume fields.
 *
 * SCFD v2 is data-only (dims, frame, voxels, dynamic range).  How a field
 * should LOOK on first registration — its palette and densityScale — is
 * presentation, not data, and lives here instead of in the binary header.
 *
 * Why a TS registry rather than a sidecar JSON: known fields are part of
 * skymap's domain vocabulary, the set is small, and tweaking a default
 * should be a single-line edit (not a binary rebuild + R2 sync).  If an
 * external producer ever ships an SCFD whose handle isn't in this map,
 * `FALLBACK_VOLUME_DEFAULTS` keeps the renderer rendering something sane.
 */
import type { ScalarFieldPaletteId } from '../@types/ScalarCube';

export type VolumeFieldDefaults = {
  paletteId: ScalarFieldPaletteId;
  /**
   * Per-cube opacity multiplier; see the alpha-formula docblock in
   * `scalarVolumeRenderer.ts`.  Tuned per field so intensity=1 produces
   * a saturated-but-not-flat overlay against typical data ranges.
   */
  densityScale: number;
  /** Optional human-readable label override (renderer falls back to handle). */
  label?: string;
};

/**
 * Neutral fallback for handles not registered above.  Sequential viridis
 * + densityScale=1.0 gives "visible without surprising assumptions" —
 * good enough to debug a new field before its real defaults are tuned.
 */
export const FALLBACK_VOLUME_DEFAULTS: VolumeFieldDefaults = {
  paletteId: 'viridis',
  densityScale: 1.0,
};

export const VOLUME_FIELD_DEFAULTS: Record<string, VolumeFieldDefaults> = {
  'cf4-density': {
    paletteId: 'coolwarm',
    densityScale: 5.0,
    label: 'CF-4 DM density',
  },
  'debug-gaussian': {
    paletteId: 'blue-purple',
    densityScale: 10.0,
    label: 'Gaussian (debug)',
  },
  'debug-cartesian': {
    paletteId: 'magma',
    densityScale: 4.0,
    label: 'Cartesian grid (debug)',
  },
  'debug-spherical': {
    paletteId: 'magma',
    densityScale: 4.0,
    label: 'Spherical grid (debug)',
  },
};

export function getVolumeFieldDefaults(handle: string): VolumeFieldDefaults {
  return VOLUME_FIELD_DEFAULTS[handle] ?? FALLBACK_VOLUME_DEFAULTS;
}
```

> **Note on Gaussian densityScale:** synthetic generators previously hard-coded `densityScale = 10.0` for the Gaussian and `4.0` for the grids; lift those values here verbatim so visual output is unchanged. Grep `src/data/syntheticScalarField.ts` for the current literals before writing this file in case they've drifted.

- [ ] **Step 1.4: Run; verify it passes.**

```
npx vitest run tests/data/volumeFieldDefaults.test.ts
```
Expected: 4/4 pass.

- [ ] **Step 1.5: Commit.**

```
git add src/data/volumeFieldDefaults.ts tests/data/volumeFieldDefaults.test.ts
git commit -m "feat(volumes): VOLUME_FIELD_DEFAULTS registry for per-handle presentation"
```

---

### Task 2: Add `setDensityScale` to scalarVolumeRenderer

**Files:**
- Modify: `src/services/gpu/renderers/scalarVolumeRenderer.ts`
- Modify: `src/@types/EngineHandle.d.ts`
- Modify: `src/services/engine/engine.ts`
- Test: `tests/services/gpu/renderers/scalarVolumeRenderer.test.ts`

Why this happens before the SCFD/type changes: callers need a way to set densityScale once it stops coming from the cube. Adding the setter first means Task 4's commit-site changes have a target to call.

- [ ] **Step 2.1: Find the existing densityScale plumbing.**

Run:
```
grep -n "densityScale" src/services/gpu/renderers/scalarVolumeRenderer.ts
```
Expected: hits at `FieldEntry.densityScale`, `addField` (assigning from `cube.densityScale`), and the uniform-buffer write site (`scratch[56] = e.densityScale`).

- [ ] **Step 2.2: Write a failing test for `setDensityScale`.**

Add to `tests/services/gpu/renderers/scalarVolumeRenderer.test.ts`:

```ts
it('setDensityScale mutates the field entry and re-uploads the uniform', () => {
  const renderer = makeRendererWithMockDevice();
  renderer.addField('h', makeMinimalCube());
  renderer.setDensityScale('h', 7.5);
  // Inspect the FieldEntry via the (test-only) accessor or the uniform-buffer mock.
  expect(getDensityScaleForField(renderer, 'h')).toBeCloseTo(7.5, 6);
});
```

(Use whatever test helpers already exist in the file — match the surrounding pattern. If no helper exposes the entry, add a minimal `__getFieldEntryForTest(handle)` debug accessor on the renderer, same pattern any sibling renderer uses.)

- [ ] **Step 2.3: Run; verify it fails.**

```
npx vitest run tests/services/gpu/renderers/scalarVolumeRenderer.test.ts
```
Expected: failure on the new test (`setDensityScale is not a function`).

- [ ] **Step 2.4: Implement `setDensityScale`.**

In `src/services/gpu/renderers/scalarVolumeRenderer.ts`:

```ts
// In the renderer return object, alongside setIntensity / setEnabled / setContrast:
setDensityScale(handle: ScalarFieldHandle, value: number): void {
  const e = fields.get(handle);
  if (!e) return;
  // Clamp negative or NaN inputs to 0 — the alpha integral with a negative
  // densityScale is meaningless and would invert the colour mapping.
  e.densityScale = Number.isFinite(value) && value > 0 ? value : 0;
  writeUniformBuffer(); // or whatever the existing write helper is named
},
```

And update `addField` to default `densityScale` to 1.0 when the cube no longer carries it. For now (Task 5 still hasn't dropped the field from `ScalarCube`), do:

```ts
densityScale: (cube as { densityScale?: number }).densityScale ?? 1.0,
```

This lets the renderer compile today and continue working unchanged until Task 5 strips the field from the type.

- [ ] **Step 2.5: Update the public engine handle.**

`src/@types/EngineHandle.d.ts`:

```ts
setVolumeFieldDensityScale?: (handle: string, value: number) => void;
```

`src/services/engine/engine.ts`: add the handler. Pattern matches `setVolumeFieldContrast`:

```ts
setVolumeFieldDensityScale: (handle, value) => {
  state.gpu.scalarVolumeRenderer?.setDensityScale(handle, value);
  const entry = state.settings.volumeFields[handle];
  if (entry) entry.densityScale = value;
},
```

(If `EngineSettingsState.volumeFields` entries don't have a `densityScale` field today, add it as an optional field there too. Check `src/@types/EngineSettingsState.d.ts` before editing.)

- [ ] **Step 2.6: Run; verify passing.**

```
npx vitest run && npx tsc --noEmit
```
Expected: green.

- [ ] **Step 2.7: Commit.**

```
git add -A
git commit -m "feat(volumes): scalarVolumeRenderer.setDensityScale + engine handle"
```

---

### Task 3: Bump SCFD encoder/decoder to v2

**Files:**
- Modify: `src/data/scalarFieldFormat.ts`
- Test: `tests/data/scalarFieldFormat.test.ts`

- [ ] **Step 3.1: Write failing tests for v2 encode + decode + v1 rejection.**

Add to `tests/data/scalarFieldFormat.test.ts`:

```ts
it('encodes v2 with palette_id and density_scale zeroed in the reserved region', () => {
  const cube = makeMinimalCube();
  const buf = encodeScalarField(cube);
  const dv = new DataView(buf);
  expect(dv.getUint32(4, true)).toBe(2);      // version
  expect(dv.getUint8(22)).toBe(0);             // palette_id byte → reserved
  expect(dv.getFloat32(64, true)).toBe(0);     // density_scale slot → reserved
});

it('round-trips a v2 file without palette/densityScale on the decoded cube', () => {
  const cube = makeMinimalCube();
  const decoded = decodeScalarField(encodeScalarField(cube));
  expect('paletteId' in decoded).toBe(false);
  expect('densityScale' in decoded).toBe(false);
});

it('rejects a v1 file with a regenerate-hint error', () => {
  // Hand-craft a minimal 96-byte v1 header so we can verify the error path.
  const v1Buf = makeV1HeaderForRejectTest();
  expect(() => decodeScalarField(v1Buf)).toThrow(/version 1.*regenerate/i);
});
```

`makeV1HeaderForRejectTest` is a ~15-line helper inside the test file: writes magic + version=1 + minimal dims into a 96-byte buffer, no voxel payload needed since the version check is the first reject.

- [ ] **Step 3.2: Run; verify failure.**

```
npx vitest run tests/data/scalarFieldFormat.test.ts
```
Expected: three new tests fail.

- [ ] **Step 3.3: Update the encoder.**

In `src/data/scalarFieldFormat.ts`:
- Change `const VERSION = 1` to `const VERSION = 2`.
- Update the header docblock: bytes 22 (palette_id) and 64..67 (density_scale) become "reserved (was: palette_id in v1 / density_scale in v1)".
- In `encodeScalarField`, delete the `dv.setUint8(22, PALETTE_ID_TO_INDEX[cube.paletteId])` line and the `dv.setFloat32(64, cube.densityScale, true)` line.
- Remove the `PALETTE_ID_TO_INDEX` and `INDEX_TO_PALETTE_ID` tables AND the `ScalarFieldPaletteId` import (palette is no longer a binary concern).

- [ ] **Step 3.4: Update the decoder.**

In `decodeScalarField`:
- Keep the existing strict version check, just bump the expected value to 2. The error message already includes a "regenerate" hint — verify it still reads well for someone hitting it with a v1 file.
- Drop the `paletteIdIdx` read, the `INDEX_TO_PALETTE_ID` lookup, and the `densityScaleRaw` / `densityScale` reads.
- Drop `paletteId` and `densityScale` from the returned object literal.

- [ ] **Step 3.5: Run; verify passing.**

```
npx vitest run tests/data/scalarFieldFormat.test.ts
```
Expected: green. The pre-existing v1 round-trip test will need its assertions updated alongside (drop `cube.paletteId` / `cube.densityScale` from the expected shape).

- [ ] **Step 3.6: Run the full suite to surface ripple effects.**

```
npx vitest run && npx tsc --noEmit
```
Expected: TypeScript errors at every site that reads `cube.paletteId` / `cube.densityScale`. **Do not fix those yet** — Tasks 4 and 5 own them. Note the failing files for sanity check at the end.

- [ ] **Step 3.7: Commit.**

```
git add -A
git commit -m "feat(scfd): bump format to v2 — drop palette + densityScale from binary"
```

---

### Task 4: Move `wireSlots` commits onto the registry

**Files:**
- Modify: `src/services/engine/phases/wireSlots.ts`
- Test: existing test suite must stay green.

- [ ] **Step 4.1: Import the registry.**

```ts
import { getVolumeFieldDefaults } from '../../data/volumeFieldDefaults';
```

- [ ] **Step 4.2: Rewrite the cf4Density commit.**

Replace the existing block:

```ts
commit: async (cube) => {
  const renderer = state.gpu.scalarVolumeRenderer;
  if (!renderer) return;
  const handle = 'cf4-density';
  const defaults = getVolumeFieldDefaults(handle);
  renderer.addField(handle, cube);
  if (!state.settings.volumeFields[handle]) {
    state.settings.volumeFields[handle] = {
      enabled: DEFAULT_CF4_DENSITY_ENABLED,
      intensity: DEFAULT_VOLUME_FIELD_INTENSITY,
      contrast: DEFAULT_VOLUME_FIELD_CONTRAST,
      paletteId: defaults.paletteId,
    };
  }
  const persisted = state.settings.volumeFields[handle]!;
  renderer.setIntensity(handle, persisted.intensity);
  renderer.setEnabled(handle, persisted.enabled);
  renderer.setContrast(handle, persisted.contrast);
  renderer.setFieldPalette(handle, persisted.paletteId);
  renderer.setDensityScale(handle, defaults.densityScale);
  cb.onVolumeFieldsChanged?.();
  state.subsystems.scheduler.requestRender();
},
```

- [ ] **Step 4.3: Same treatment for the synthetic-volume commit.**

In `mintSyntheticVolumeSlot`:

```ts
commit: async (cube) => {
  const renderer = state.gpu.scalarVolumeRenderer;
  if (!renderer) return;
  const defaults = getVolumeFieldDefaults(handle);
  renderer.addField(handle, cube);
  if (!state.settings.volumeFields[handle]) {
    state.settings.volumeFields[handle] = {
      enabled: defaultEnabled,
      intensity: DEFAULT_VOLUME_FIELD_INTENSITY,
      contrast: DEFAULT_VOLUME_FIELD_CONTRAST,
      paletteId: defaults.paletteId,
    };
  }
  const persisted = state.settings.volumeFields[handle]!;
  renderer.setIntensity(handle, persisted.intensity);
  renderer.setEnabled(handle, persisted.enabled);
  renderer.setContrast(handle, persisted.contrast);
  renderer.setFieldPalette(handle, persisted.paletteId);
  renderer.setDensityScale(handle, defaults.densityScale);
  cb.onVolumeFieldsChanged?.();
  state.subsystems.scheduler.requestRender();
},
```

- [ ] **Step 4.4: Run typecheck + tests.**

```
npx tsc --noEmit && npx vitest run
```
Expected: typecheck clean for wireSlots. Other ScalarCube-related typecheck errors from Task 3 still exist — Task 5 owns them.

- [ ] **Step 4.5: Commit.**

```
git add -A
git commit -m "refactor(volumes): wireSlots commits read defaults from registry"
```

---

### Task 5: Drop `paletteId` / `densityScale` from `ScalarCube` + producer cleanup

**Files:**
- Modify: `src/@types/ScalarCube.d.ts`
- Modify: `src/data/syntheticScalarField.ts`
- Modify: `tools/buildCf4Density.ts`
- Modify: `tests/data/syntheticScalarField.test.ts`
- Modify: `tests/tools/buildCf4Density.smoke.test.ts`
- Modify: `tests/services/gpu/renderers/scalarVolumeRenderer.test.ts`

- [ ] **Step 5.1: Strip the type.**

In `src/@types/ScalarCube.d.ts`, delete the `paletteId` and `densityScale` field declarations and their docblocks. Keep `valueMin` / `valueMax` (genuine data properties).

- [ ] **Step 5.2: Run typecheck — let TS guide the cleanup.**

```
npx tsc --noEmit
```
Expected: errors listing every site that reads or writes `cube.paletteId` / `cube.densityScale`. Walk the list and prune.

- [ ] **Step 5.3: Update `tools/buildCf4Density.ts`.**

- Delete `DEFAULT_CF4_PALETTE` and `CF4_DENSITY_SCALE` constants.
- Delete the `--palette` CLI flag handling (`args.paletteId`, `paletteId = args.paletteId ?? DEFAULT_CF4_PALETTE`, etc).
- Drop `paletteId` and `densityScale` from the `cube` object literal passed to `encodeScalarField`.
- Update the `console.log` summary line to omit `palette=… densityScale=…`.

- [ ] **Step 5.4: Update `src/data/syntheticScalarField.ts`.**

- Drop `paletteId` and `densityScale` from the generator's option types.
- Drop both fields from the returned cube literals.
- Delete the default constants (`paletteId = opts.paletteId ?? 'magma'`, etc).

- [ ] **Step 5.5: Update test files.**

For each, remove the assertions and fixture fields TypeScript flags:

- `tests/data/syntheticScalarField.test.ts` — drop palette/scale expectations.
- `tests/tools/buildCf4Density.smoke.test.ts` — drop the `cube.paletteId` and `cube.densityScale` asserts; keep voxel-mapping and origin/rotation asserts.
- `tests/services/gpu/renderers/scalarVolumeRenderer.test.ts` — drop palette/scale from any `makeMinimalCube` helper; the renderer now defaults densityScale internally.

- [ ] **Step 5.6: Run typecheck + tests.**

```
npx tsc --noEmit && npx vitest run
```
Expected: clean. If anything still references `cube.paletteId` / `cube.densityScale`, fix it inline — Task 5 owns ALL the propagation.

- [ ] **Step 5.7: Commit.**

```
git add -A
git commit -m "refactor(scfd): drop palette + densityScale from ScalarCube + producers"
```

---

### Task 6: Regenerate `cf4_density.scfd` and verify

**Files:**
- Regenerate: `public/data/cf4_density.scfd`
- Test: existing e2e + smoke spec.

- [ ] **Step 6.1: Rebuild the .scfd.**

```
npm run build-cf4-density
```
Expected: console output mentions `dims=128x128x128, voxelSize=7.813 Mpc`. Palette/densityScale references should be gone from the build script's log line (changed in Task 5).

- [ ] **Step 6.2: Verify the new binary.**

Inspect the version byte:

```
xxd -l 8 public/data/cf4_density.scfd
```
Expected: bytes 0..3 = `53 43 46 44` (SCFD), bytes 4..7 = `02 00 00 00` (version=2). Bytes 22 and 64..67 should be zero — check with `xxd -s 16 -l 64 public/data/cf4_density.scfd | head`.

- [ ] **Step 6.3: Smoke-check in dev.**

Run `npm run dev` if not already running and load `http://localhost:5173/`. Visually confirm:
- CF-4 cube renders with coolwarm palette (defaults from registry, not from binary).
- Cosmic mean is transparent; over-densities red; voids blue. Same visual as today's main.

If the visual changed, the registry's `densityScale: 5.0` for `cf4-density` doesn't match what `buildCf4Density.ts` was encoding before. Cross-check that constant.

- [ ] **Step 6.4: Run the full suite once more.**

```
npx tsc --noEmit && npx vitest run
```
Expected: typecheck clean; same test count as Step 0.1 baseline plus the new tests from Tasks 1–3.

- [ ] **Step 6.5: Commit the regenerated binary? No.**

Per CLAUDE.md, `public/data/*.bin` and `*.scfd` are gitignored as build artifacts. Don't `git add` it — the maintainer ships it to R2 via `npm run sync-r2` as part of the rollout.

- [ ] **Step 6.6: Rollout reminder.**

Because v1 is rejected outright, the code deploy and R2 sync **must land together** — otherwise the live site will hit "version 1 — regenerate" on the existing R2 cube. The PR body should call this out explicitly so the maintainer doesn't merge → forget → see a broken volume.

---

## Self-review checklist

After all tasks, scan the diff one more time:

- [ ] Grep `cube.paletteId` and `cube.densityScale` across `src/` and `tools/` — should return zero hits.
- [ ] Grep `paletteId` inside `src/data/scalarFieldFormat.ts` — should return zero hits (palette is no longer a format concern).
- [ ] `PALETTE_IDS` from `src/data/scalarFieldPalettes.ts` is still imported wherever the palette dropdown lives.
- [ ] v1-rejection test (Task 3) exists and is green — the "stale R2 file fails loudly with a regenerate hint" path is enforced, not just hoped for.
- [ ] `npm run build` produces a working bundle.

## Risk + Tradeoffs

- **v1 files are rejected outright.** Any stale v1 SCFD on R2 makes the volume fail to load with a "version 1 — regenerate" error visible in the console. Mitigation: roll out the code deploy + the regenerated `.scfd` together (Step 6.6).
- **The Volumes panel's palette dropdown still works.** Per-field palette is runtime state; the registry only provides the **initial** value at field registration.
- **External producers.** If a third party ever generates a v2 SCFD with a handle skymap doesn't know, `FALLBACK_VOLUME_DEFAULTS` (viridis + densityScale 1.0) handles it. Their handle just needs to land in `VOLUME_FIELD_DEFAULTS` later for a tuned default.
- **No `--palette` build-time override anymore.** If a future use case wants per-build palette injection (e.g. CI generates a magma variant for a paper), reintroduce it via a registry override or build-script CLI arg that calls `setFieldPalette` after registration. Don't put it back in the binary.

## Done — handoff

After Task 6 commits cleanly, open a PR. Body should call out: (a) the new registry is the source of truth for presentation defaults; (b) **v1 SCFD files are rejected** — the maintainer MUST run `npm run sync-r2` against the freshly-built v2 `cf4_density.scfd` before / alongside merging the PR, or the live site will hit a decode error on the next reload.
