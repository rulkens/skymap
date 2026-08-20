/**
 * computeSceneEntering — the scene state entering beat K, as a pure function.
 *
 * Tour beats mutate the scene through cues embedded at arbitrary offsets in
 * their clips, so navigation that doesn't play a beat to completion (a mid-fly
 * skip) or revisits an earlier one (Prev) would otherwise leave the scene in a
 * state no forward playthrough can produce — a survey revealed by a skipped
 * cue missing, or a later beat's volume still lit two beats back. Rather than
 * track deltas per navigation kind, the scene entering beat K is RECONSTRUCTED:
 * the tour-start baseline folded through every scene cue of beats 0..K-1.
 * Navigation becomes jump-to-index; there is no path-dependence to get wrong.
 *
 * The fold reuses the production machinery end to end: cues map to settings
 * actions through the same tables `applySceneEffect` dispatches from
 * (`VISIBILITY_ACTION_ROW`, `scopedVisibilityActions`), and each action is
 * applied through the REAL settings reducer. Nothing is reimplemented, so the
 * fold cannot drift from what playback actually does.
 *
 * Cues are collected in tree order (a `seq`/`all`/`fork` nesting walk), which
 * matches compile order. Only `show` / `hide` / `scene` participate: `focus`
 * is beat-local (each beat's enter clip establishes its own subject), `fade`
 * is transient clip opacity that resets at clip end, and the camera-motion
 * arms don't touch settings at all. `frameTo` is deliberately excluded too,
 * even though it DOES write a setting (`orientation`, via `setOrientation`):
 * `orientation` lives on `SceneSnapshot`, not `SettingsSnapshot` (this
 * function's return type — see that type's header for why), so nothing this
 * fold could produce would ever fit the return shape. The tour's authored
 * pole is carried forward live instead — a beat's `frameTo` cue sets it once
 * when it actually plays, and no later beat-entry reconstruction touches it
 * again. Dwell-clip cues count too — a dwell that reveals a layer is part of
 * the beat's contribution.
 *
 * `base` is a FULL settings state (the guided tour builds it by merging its
 * captured baseline onto the live state) because the reducer operates on full
 * state and per-item fan-outs enumerate `items` records from it. The return is
 * snapshot-shaped — exactly what `mergeSnapshot` accepts.
 */

import settingsReducer from '../settings/settingsSlice';
import { captureSettings } from './captureSettings';
import { VISIBILITY_ACTION_ROW } from '../../services/animation/visibilityActionRow';
import { scopedVisibilityActions } from '../../services/animation/scopedVisibilityActions';
import type { Action } from '@reduxjs/toolkit';
import type { BeatData } from '../../@types/animation/tour/BeatData';
import type { ClipData } from '../../@types/animation/ClipData';
import type { Effect } from '../../@types/animation/Effect';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import type { SettingsSnapshot } from '../../@types/engine/settings/SettingsSnapshot';

/** Settings actions a single effect node contributes (empty for non-scene nodes). */
function actionsOf(effect: Effect, settings: EngineSettingsState): readonly Action[] {
  switch (effect.kind) {
    case 'show':
    case 'hide': {
      const on = effect.kind === 'show';
      return [
        ...effect.layers.flatMap((layer) => VISIBILITY_ACTION_ROW[layer].actions(on, settings)),
        ...(effect.scoped ?? []).flatMap((arg) => scopedVisibilityActions(arg, on, settings)),
      ];
    }
    case 'scene':
      return [effect.action];
    default:
      return [];
  }
}

/** Fold one clip's cues (tree order) into the settings state. */
function foldClip(state: EngineSettingsState, clip: ClipData): EngineSettingsState {
  const walk = (effects: readonly Effect[], acc: EngineSettingsState): EngineSettingsState => {
    let s = acc;
    for (const e of effects) {
      for (const action of actionsOf(e, s)) s = settingsReducer(s, action);
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
