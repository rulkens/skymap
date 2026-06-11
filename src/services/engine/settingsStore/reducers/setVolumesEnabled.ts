/**
 * setVolumesEnabled — pure reducer for the scalar-volume overlay master gate.
 *
 * Copy-on-write at the touched cluster only: a new top-level state and a new
 * `volumes` object, every sibling cluster left at its existing reference. That
 * ref-stability lets React selectors over untouched clusters skip re-rendering
 * and keeps the engine's per-frame `state.settings` reads cheap — the snapshot
 * only changes shape where a write landed.
 *
 * `volumes` is a SHARED cluster: this reducer writes `enabled`, the per-field
 * reducers write `items`. Spreading the existing object preserves the sibling
 * `items` Record reference untouched — that ref-stability is what keeps the
 * per-field rows selector (`selectVolumeFieldItems`) stable when only the master
 * toggle flips, so the volume-field panel rows don't rebuild on a master toggle.
 *
 * The reducer stores the boolean verbatim. The cosmetic master fade ramp that
 * accompanies the toggle stays in the handle setter's `fades.fadeTo({ kind:
 * 'volumesMaster' })` call — it's a render side-effect, not a settings write.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function setVolumesEnabled(
  state: EngineSettingsState,
  enabled: boolean,
): EngineSettingsState {
  return { ...state, volumes: { ...state.volumes, enabled } };
}
