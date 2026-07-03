/**
 * computeSceneEntering tests — the pure scene-reconstruction fold.
 *
 * The scene entering beat K is a pure function: the tour baseline folded
 * through every scene cue (show / hide / scene) of beats 0..K-1, applied via
 * the REAL settings reducer + the same action tables `applySceneEffect` uses.
 * These tests pin that contract with hand-built beats — no store, no sagas,
 * no playback.
 */

import { describe, it, expect } from 'vitest';

import { computeSceneEntering } from '../../../src/state/tour/computeSceneEntering';
import { buildInitialSettings } from '../../../src/state/settings/initialState';
import { captureSettings } from '../../../src/state/tour/captureSettings';
import {
  all,
  fork,
  hide,
  hold,
  scene,
  seq,
  show,
} from '../../../src/services/engine/animation/effectHelpers';
import { setLabelsFocusedOnly } from '../../../src/state/settings/settingsSlice';
import { dwellDrift } from '../../../src/state/tour/dwellDrift';
import type { BeatData } from '../../../src/@types/animation/tour/BeatData';
import type { ClipData } from '../../../src/@types/animation/ClipData';

const clip = (timeline: ClipData['timeline']): ClipData => ({ start: 'live', timeline });

// A grand-tour-shaped fixture: beat 0 strips the scene, beat 1 reveals one
// scoped survey, beat 2 reveals filaments in its enter and volumes from its
// DWELL clip (dwell cues must count toward the prefix too).
const BEATS: readonly BeatData[] = [
  {
    caption: { title: 'strip' },
    enterClip: clip([
      hide(['volumesMaster', 'filaments', 'survey'], 0),
      scene(setLabelsFocusedOnly(true)),
    ]),
    dwellClip: dwellDrift(1),
  },
  {
    caption: { title: 'survey reveal' },
    enterClip: clip([show(['survey:2mrs'], 1)]),
    dwellClip: dwellDrift(1),
  },
  {
    caption: { title: 'web reveal' },
    enterClip: clip([show(['filaments'], 9)]),
    dwellClip: clip([show(['volumesMaster'], 2)]),
  },
];

describe('computeSceneEntering', () => {
  it('k=0 is the baseline unchanged', () => {
    const base = buildInitialSettings();
    const result = computeSceneEntering(base, BEATS, 0);
    expect(result).toEqual(captureSettings({ settings: base }));
  });

  it('folds beat 0’s hide sweep and scene cue into the state entering beat 1', () => {
    const base = buildInitialSettings();
    const result = computeSceneEntering(base, BEATS, 1);

    expect(result.volumes.enabled).toBe(false);
    expect(result.filaments.enabled).toBe(false);
    expect(result.labels.focusedOnly).toBe(true);
    // The bare 'survey' key fans out over every catalog item.
    for (const item of Object.values(result.galaxyCatalogs.items)) {
      expect(item.enabled).toBe(false);
    }
  });

  it('applies scoped entries to exactly one item', () => {
    const base = buildInitialSettings();
    const result = computeSceneEntering(base, BEATS, 2);

    expect(result.galaxyCatalogs.items['2mrs']!.enabled).toBe(true);
    expect(result.galaxyCatalogs.items.sdss!.enabled).toBe(false);
  });

  it('includes dwell-clip cues in the prefix', () => {
    const base = buildInitialSettings();
    const result = computeSceneEntering(base, BEATS, 3);

    expect(result.filaments.enabled).toBe(true); // beat 2 enter
    expect(result.volumes.enabled).toBe(true); // beat 2 DWELL cue
  });

  it('collects cues nested inside seq / all / fork', () => {
    const base = buildInitialSettings();
    const beats: readonly BeatData[] = [
      {
        caption: null,
        enterClip: clip([
          seq([hold(1), all([fork(hide(['filaments'], 0)), scene(setLabelsFocusedOnly(true))])]),
        ]),
        dwellClip: dwellDrift(1),
      },
    ];
    const result = computeSceneEntering(base, beats, 1);
    expect(result.filaments.enabled).toBe(false);
    expect(result.labels.focusedOnly).toBe(true);
  });

  it('does not mutate the baseline', () => {
    const base = buildInitialSettings();
    const before = structuredClone(base);
    computeSceneEntering(base, BEATS, 3);
    expect(base).toEqual(before);
  });
});
