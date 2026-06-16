// ── Volume field id listing ─────────────────────────────────────────────────
//
// Module-scope so the `createEngine` literal delegates here (mirroring the other
// `handles/` accessors) and so it's testable without a full GPU engine.
//
// Settings keys are the source of truth for which fields exist; mirrors
// `buildVolumeFieldsSnapshot` so both views of identity stay in sync.

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';

export function listVolumeFields(state: Pick<EngineState, 'settings'>): VolumeFieldId[] {
  return Object.keys(state.settings.volumes.items) as VolumeFieldId[];
}
