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
 * **DEV-only:** callers gate on `import.meta.env.DEV`.  These are
 * axis-verification fixtures, not science data — production users
 * would just see noise.  Vite tree-shakes the block from production
 * bundles because `import.meta.env.DEV` is a compile-time constant.
 *
 * **Commit pattern.**  The commit seeds the settings row (copy-on-write,
 * first load only), calls `addField`, and drives the fade from the
 * settings enable bit — mirroring what `engine.ts addVolumeField` does.
 * The renderer reads per-cube static config from the registry and
 * user-tunable knobs from `state.settings.volumes.fields` per frame;
 * no renderer setters are replayed here.  Accessing `state` directly
 * (the same pattern the `filamentSlot` commit uses) is safe: `state` is
 * fully initialised before any slot commit runs.
 */

import { createAssetSlot } from '../AssetSlot';
import { syntheticVolumeFetcher } from '../fetchers/syntheticVolumeFetcher';
import type { SyntheticVolumeReq } from '../../../@types/loading/SyntheticVolumeReq';
import { buildVolumeFieldSettings } from '../../../data/volumeFieldDefaults';
import { FADE_IN_DURATION_MS } from '../../animation/fadeController';
import type { ScalarCube } from '../../../@types/data/ScalarCube';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';
import { buildVolumeFieldsSnapshot } from '../../engine/helpers/buildVolumeFieldsSnapshot';

type SyntheticVolumeHandle = 'debug-gaussian' | 'debug-cartesian' | 'debug-spherical';

type SyntheticVolumeSlotRecord = Record<
  SyntheticVolumeHandle,
  AssetSlot<ScalarCube, SyntheticVolumeReq>
>;

/**
 * createSyntheticVolumeSlots — mint all three DEV fixtures and return
 * the slot record. The caller installs it onto
 * `state.assetSlots.syntheticVolumes` and registers each slot on
 * `allSlots`. Construction-pure like the registry factories: it builds +
 * subscribes but does NOT write `state.assetSlots` (the orchestrator owns
 * install).
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
  // Helper that mints one synthetic-volume slot.  The handle is baked
  // into a closure (the AssetSlot commit signature only sees the
  // decoded payload, not the request, so per-fixture identity has to
  // ride along on the slot).  Three sibling slots share this helper;
  // refactoring to a Map of three would lose the per-handle commit
  // closure that's the whole point.  The default-enabled bit comes from
  // each fixture's registry `visible` flag (all three are false), so it
  // no longer needs threading through as a separate argument.
  const mintSyntheticVolumeSlot = (
    handle: SyntheticVolumeHandle,
  ): AssetSlot<ScalarCube, SyntheticVolumeReq> =>
    createAssetSlot({
      name: `syntheticVolume:${handle}`,
      fetch: syntheticVolumeFetcher,
      commit: async (cube) => {
        const renderer = state.gpu.scalarVolumeRenderer;
        if (!renderer) return;
        renderer.addField(handle, cube);
        // Synthetic fixtures get NO construction seed (DEV-only), so this
        // commit seeds the settings row on first load (copy-on-write).  The
        // renderer reads the per-cube static config from the registry and
        // the user knobs from settings per frame, so no renderer setter is
        // replayed here.
        if (!state.settings.volumes.fields[handle]) {
          state.settings.volumes.fields = {
            ...state.settings.volumes.fields,
            [handle]: buildVolumeFieldSettings(handle),
          };
        }
        if (state.settings.volumes.fields[handle]?.enabled) {
          void state.subsystems.fades.fadeTo(
            { kind: 'scalarField', field: handle },
            1,
            FADE_IN_DURATION_MS,
          );
        }
        cb.volumes?.onFieldsChanged?.(buildVolumeFieldsSnapshot(state));
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
    'debug-gaussian': mintSyntheticVolumeSlot('debug-gaussian'),
    'debug-cartesian': mintSyntheticVolumeSlot('debug-cartesian'),
    'debug-spherical': mintSyntheticVolumeSlot('debug-spherical'),
  };
  return slots;
}
