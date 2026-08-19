/**
 * The ONE volume-field ingest path: every volume slot commit and the public
 * `handle.volumes.add` call this. Order is load-bearing — the settings row must
 * exist before the fade reads its intent, and the cube must be resident before
 * the fade's guard reads `listIds()`. Flow's cube (`flowFieldSlot.ts`) skips
 * this path deliberately — different renderer/arity/fade key; see decision #14.
 */

import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { AppStore } from '../../../store/types';
import { addVolumeField } from '../../../state/settings/settingsSlice';
import { syncVisibilityFades } from '../wiring/syncVisibilityFades';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function uploadVolumeField(
  state: ApplyIntentState,
  store: AppStore,
  id: VolumeFieldId,
  cube: ScalarCube,
): void {
  // Race guard, re-read per call — do not hoist into a closure (engine.ts:490-492).
  const renderer = state.gpu.volumeFieldRenderer;
  if (!renderer) return;
  store.dispatch(addVolumeField(id));
  renderer.upload(id, cube);
  syncVisibilityFades(state, { animate: true, only: ['volumeField'] });
  // Wake rides the settings-row dispatch; watchWakeSaga's route table renders it (#14 D2).
}
