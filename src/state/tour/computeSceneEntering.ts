/**
 * computeSceneEntering — the scene entering beat K, RECONSTRUCTED rather than
 * tracked: the tour-start baseline folded through every scene cue of beats 0..K-1,
 * so a mid-fly skip or a Prev is jump-to-index with no path-dependence. The fold
 * runs cues through `sceneActionsOf` and the REAL settings reducer, so it cannot
 * drift from playback.
 *
 * A `frameTo` folds into `orientation`, which `captureSettings` drops: the pole
 * lives on `SceneSnapshot`, not the returned `SettingsSnapshot`, so the authored
 * pole is carried forward live instead.
 */

import settingsReducer from '../settings/settingsReducer';
import { captureSettings } from '../scene/captureSettings';
import { sceneActionsOf } from '../../utils/animation/sceneActionsOf';
import type { BeatData } from '../../@types/animation/tour/BeatData';
import type { ClipData } from '../../@types/animation/ClipData';
import type { Effect } from '../../@types/animation/Effect';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import type { SettingsSnapshot } from '../../@types/engine/settings/SettingsSnapshot';

/** Fold one clip's cues (tree order) into the settings state. */
function foldClip(state: EngineSettingsState, clip: ClipData): EngineSettingsState {
  const walk = (effects: readonly Effect[], acc: EngineSettingsState): EngineSettingsState => {
    let s = acc;
    for (const e of effects) {
      for (const action of sceneActionsOf(e, s)) s = settingsReducer(s, action);
      if (e.kind === 'seq' || e.kind === 'all') s = walk(e.children, s);
      else if (e.kind === 'fork') s = walk([e.child], s);
    }
    return s;
  };
  return walk(clip.timeline, state);
}

export function computeSceneEntering(
  base: EngineSettingsState,
  beats: readonly BeatData[],
  k: number,
): SettingsSnapshot {
  let state = base;
  for (const beat of beats.slice(0, k)) {
    if (beat.enterClip !== undefined) state = foldClip(state, beat.enterClip);
    state = foldClip(state, beat.dwellClip);
  }
  return captureSettings({ settings: state });
}
