/**
 * syntheticVolumeSlots — factory for the three DEV-only synthetic
 * volume fixtures (Gaussian blob, Cartesian grid, spherical grid).
 *
 * Each fixture drives the same `volumeFieldRenderer` commit path as
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
 */

import { createAssetSlot } from '../AssetSlot';
import { syntheticVolumeFetcher } from '../fetchers/syntheticVolumeFetcher';
import type { SyntheticVolumeReq } from '../../../@types/loading/SyntheticVolumeReq';
import { uploadVolumeField } from '../../engine/volume/uploadVolumeField';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';

type SyntheticVolumeId = 'debug-gaussian' | 'debug-cartesian' | 'debug-spherical';

type SyntheticVolumeSlotRecord = Record<
  SyntheticVolumeId,
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
  // The id is baked into a closure (the AssetSlot commit signature only sees
  // the decoded payload, not the request, so per-fixture identity has to
  // ride along on the slot).  Three sibling slots share this helper;
  // refactoring to a Map of three would lose the per-id commit closure
  // that's the whole point.
  const mintSyntheticVolumeSlot = (
    id: SyntheticVolumeId,
  ): AssetSlot<ScalarCube, SyntheticVolumeReq> =>
    createAssetSlot({
      name: `syntheticVolume:${id}`,
      fetch: syntheticVolumeFetcher,
      commit: async (cube) => {
        uploadVolumeField(state, cb.store, id, cube);
      },
    });

  // All three synthetic fixtures register but stay OFF on boot: they
  // exist as opt-in diagnostic fixtures (Gaussian for "is anything
  // visible?" smoke tests, the two grids for axis/scale/origin
  // verification).  The CF-4 density field is what users should see
  // first; cluttering the scene with a default-on Gaussian sphere
  // fights that.
  const slots: SyntheticVolumeSlotRecord = {
    'debug-gaussian': mintSyntheticVolumeSlot('debug-gaussian'),
    'debug-cartesian': mintSyntheticVolumeSlot('debug-cartesian'),
    'debug-spherical': mintSyntheticVolumeSlot('debug-spherical'),
  };
  return slots;
}
