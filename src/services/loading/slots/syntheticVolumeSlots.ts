/**
 * syntheticVolumeSlots — factory for the three DEV-only synthetic
 * volume fixtures (Gaussian blob, Cartesian grid, spherical grid).
 *
 * Each fixture drives the same `scalarVolumeRenderer` commit path as
 * the real CF-4 density slot but with procedurally-generated cube
 * data.  Routing the synthetic cubes through the slot system (rather
 * than a bespoke "synthetic shortcut") means they get the same
 * fade-in, `LoadingDevPanel` row, race-checked commit, and retry
 * semantics as every real volume fetch — without any branching in
 * the render loop.
 *
 * **DEV-only:** callers gate on `import.meta.env.DEV || ?volumes=1`
 * before invoking this factory.  Vite tree-shakes the synthetic block
 * from production bundles when neither flag is reachable.
 *
 * **Commit pattern.**  The commit replicates the same operations
 * `engineHandle.addVolumeField(handle, cube)` performs, but directly
 * against `state` rather than through the public handle.  The public
 * handle is assigned to `deps.handleRef.current` AFTER
 * `runBootstrapPhases` resolves — so `handleRef.current` is null when
 * `wireSlots` runs.  The slot's commit callback fires asynchronously
 * (after the fetch resolves), at which point the handle IS set; but
 * relying on that timing is fragile.  Accessing `state` directly (the
 * same pattern the `filamentSlot` commit uses) is structurally safe:
 * `state` is fully initialised before any slot commit runs.  The
 * settings-bag seed and renderer calls are intentionally the same
 * lines as `addVolumeField` so both paths stay in sync when the
 * engine's volume-field logic changes.
 *
 * Pre-H4 (2026-05-11) the mint helper + three instantiations lived
 * inline in `wireSlots.ts`; extracted here as part of the slot-factory
 * split.
 */

import { createAssetSlot } from '../AssetSlot';
import { syntheticVolumeFetcher } from '../fetchers/syntheticVolumeFetcher';
import type { SyntheticVolumeReq } from '../fetchers/syntheticVolumeFetcher';
import { DEFAULT_VOLUME_FIELD_INTENSITY } from '../../../data/defaults';
import { getVolumeFieldDefaults } from '../../../data/volumeFieldDefaults';
import type { ScalarCube } from '../../../@types/ScalarCube';
import type { AssetSlot } from '../types';
import type { EngineState, EngineCallbacks } from '../../../@types';

type SyntheticVolumeHandle = 'debug-gaussian' | 'debug-cartesian' | 'debug-spherical';

type SyntheticVolumeSlotRecord = Record<
  SyntheticVolumeHandle,
  AssetSlot<ScalarCube, SyntheticVolumeReq>
>;

/**
 * createSyntheticVolumeSlots — mint all three DEV fixtures, write to
 * `state.assetSlots.syntheticVolumes`, and return the slot record so
 * the caller can register each one on `allSlots`.
 *
 * Diverges from the `SlotFactory<TPayload, TRequest>` shape because
 * this factory returns a record of three slots, not a single one.
 * Conceptually it's still "one factory per slot kind" — synthetic
 * volumes are the only kind that mints multiple fixtures from a shared
 * helper closure.
 */
export function createSyntheticVolumeSlots(
  state: EngineState,
  cb: EngineCallbacks,
): SyntheticVolumeSlotRecord {
  // Helper that mints one synthetic-volume slot.  The handle and the
  // default-enabled flag are baked into a closure (the AssetSlot
  // commit signature only sees the decoded payload, not the request,
  // so per-fixture identity has to ride along on the slot).  Three
  // sibling slots share this helper; refactoring to a Map of three
  // would lose the per-handle commit closure that's the whole point.
  const mintSyntheticVolumeSlot = (
    handle: string,
    defaultEnabled: boolean,
  ): AssetSlot<ScalarCube, SyntheticVolumeReq> =>
    createAssetSlot({
      name: `syntheticVolume:${handle}`,
      fetch: syntheticVolumeFetcher,
      commit: async (cube) => {
        const renderer = state.gpu.scalarVolumeRenderer;
        if (!renderer) return;
        // Seed defaults from the per-handle registry; see
        // `src/data/volumeFieldDefaults.ts` for the why-not-binary
        // discussion.  Same shape as the cf4Density commit —
        // only the handle (closure-captured) and the `enabled` seed
        // (per-fixture via `defaultEnabled`) differ.
        const defaults = getVolumeFieldDefaults(handle);
        renderer.addField(handle, cube);
        // Seed the per-field settings entry with defaults if not
        // already present — mirrors the guard in `addVolumeField`
        // so re-registering preserves any previously-tuned values.
        if (!state.settings.volumes.fields[handle]) {
          state.settings.volumes.fields[handle] = {
            enabled: defaultEnabled,
            intensity: DEFAULT_VOLUME_FIELD_INTENSITY,
            contrast: defaults.contrast,
            densityScale: defaults.densityScale,
            paletteId: defaults.paletteId,
          };
        }
        const persisted = state.settings.volumes.fields[handle]!;
        renderer.setIntensity(handle, persisted.intensity);
        renderer.setEnabled(handle, persisted.enabled);
        renderer.setContrast(handle, persisted.contrast);
        renderer.setFieldPalette(handle, persisted.paletteId);
        renderer.setDensityScale(handle, persisted.densityScale);
        // Same per-cube envelope plumbing as the cf4Density commit.
        // Debug fixtures register `NO_SPATIAL_ENVELOPE` in the
        // registry so the envelope is visually a no-op here —
        // grid corners stay visible for axis verification.
        renderer.setEnvelope(handle, defaults.envelope.inner, defaults.envelope.outer);
        // Fire the same React-facing callback that engineHandle's
        // addVolumeField fires.  Without this, the SettingsPanel
        // never learns the new field exists — its mirror is rebuilt
        // only on this callback.  We're bypassing the public handle
        // (per the docblock above) so we have to fire it ourselves.
        cb.volumes?.onFieldsChanged?.();
        state.subsystems.scheduler.requestRender();
      },
    });

  // All three synthetic fixtures register but stay OFF on boot: they
  // exist as opt-in diagnostic fixtures (Gaussian for "is anything
  // visible?" smoke tests, the two grids for axis/scale/origin
  // verification).  The CF-4 density field is what users should see
  // first; cluttering the scene with a default-on Gaussian sphere
  // fights that.  Toggle any of them from the Volumes panel.
  const slots: SyntheticVolumeSlotRecord = {
    'debug-gaussian': mintSyntheticVolumeSlot('debug-gaussian', false),
    'debug-cartesian': mintSyntheticVolumeSlot('debug-cartesian', false),
    'debug-spherical': mintSyntheticVolumeSlot('debug-spherical', false),
  };
  state.assetSlots.syntheticVolumes = slots;
  return slots;
}
