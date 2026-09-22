/**
 * The ONE volume-field ingest path: every volume slot commit calls this. Both
 * writes must land before the slot reaches `ready` — that is the edge core fades
 * on, and it reads the settings row for the intent and `listIds()` for the
 * guard. Flow's cube (`flowFieldSlot.ts`) skips this path deliberately —
 * different renderer/arity/fade key; see decision #14.
 */

import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';
import type { CosmicWebDensitySourceEntry } from '../../../@types/data/volume/CosmicWebDensitySourceEntry';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { AppStore } from '../../../store/types';
import { addCosmicWebDensityField } from '../../../layers/cosmicWebDensity/state/cosmicWebDensity/slice';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function uploadVolumeField(
  state: ApplyIntentState,
  store: AppStore,
  entry: CosmicWebDensitySourceEntry,
  cube: ScalarCube,
): void {
  // Race guard, re-read per call — do not hoist into a closure (engine.ts:490-492).
  const renderer = state.gpu.volumeFieldRenderer;
  if (!renderer) return;
  // `SourceEntryBase.id` is `string` (every kind shares one base); every
  // `cosmicWebDensity` row's id is actually a `CosmicWebDensityFieldId` by
  // construction — the codebase-wide `as <Kind>Id` pattern (see
  // `galaxyCatalogIdOf.ts`), not a lossy cast.
  const id = entry.id as CosmicWebDensityFieldId;
  store.dispatch(addCosmicWebDensityField(id));
  renderer.upload(id, cube, entry);
  // Wake rides the settings-row dispatch; watchWakeSaga's route table renders it (#14 D2).
}
