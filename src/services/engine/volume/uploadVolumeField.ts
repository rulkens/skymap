/**
 * The ONE volume-field ingest path: every volume slot commit calls this. Both
 * writes must land before the slot reaches `ready` — that is the edge core fades
 * on, and it reads the settings row for the intent and `listIds()` for the
 * guard. Flow's cube (`flowFieldSlot.ts`) skips this path deliberately —
 * different renderer/arity/fade key; see decision #14.
 */

import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { AppStore } from '../../../store/types';
import { addVolumeField } from '../../../layers/volume/settings/volumesSlice';
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
  // Wake rides the settings-row dispatch; watchWakeSaga's route table renders it (#14 D2).
}
