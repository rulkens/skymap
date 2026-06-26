/**
 * webShowcase tests — pin the "named cosmic web" tour's structure: three beats,
 * each with a clip + caption + dwell, and a tour-level setup that strips the
 * scene to the labelled web.
 *
 * These assert on the beat data (it IS plain data) — the clip structure, captions,
 * and the tour-level scene-setup effects — without running the tour saga. The
 * end-to-end fly + isolate behaviour is covered by the guided-tour saga suites
 * and the webShowcaseDive integration test.
 */

import { describe, it, expect } from 'vitest';
import { webShowcase } from '../../../../src/data/animation/tours/webShowcase';
import {
  setVolumesEnabled,
  setFilamentsEnabled,
  setGalaxyCatalogLabelEnabled,
} from '../../../../src/state/settings/settingsSlice';

describe('webShowcase tour', () => {
  it('has three beats with captions and dwell times', () => {
    expect(webShowcase.beats).toHaveLength(3);
    expect(webShowcase.beats[0]!.caption?.title).toBe('The Milky Way');
    expect(webShowcase.beats[1]!.caption?.title).toBe('The Virgo Cluster');
    expect(webShowcase.beats[2]!.caption?.title).toBe('M87');
    expect(webShowcase.beats[0]!.dwellSec).toBe(4);
    expect(webShowcase.beats[1]!.dwellSec).toBe(6);
    expect(webShowcase.beats[2]!.dwellSec).toBe(6);
  });

  it('each beat carries a clip', () => {
    for (const beat of webShowcase.beats) {
      expect(beat.clip).toBeDefined();
      expect(beat.clip.timeline).toBeDefined();
    }
  });

  it('strips the scene to the labelled web via setup.effects', () => {
    // setup.effects dispatched before beat 1 strip the scene; the
    // guidedTourSaga snapshot/restore pair winds them back at tour end.
    const effects = webShowcase.setup?.effects ?? [];
    expect(effects).toContainEqual(setVolumesEnabled(false));
    expect(effects).toContainEqual(setFilamentsEnabled(false));
    expect(effects).toContainEqual(
      setGalaxyCatalogLabelEnabled({ id: 'famousGalaxy', enabled: false }),
    );
  });

  it('beat 2 clip carries a focusId cue (flyAndFocusOnClip)', () => {
    // beat index 1 is the Virgo Cluster beat — flyAndFocusOnClip produces a
    // timeline starting with a focusId cue before the camera-move block.
    const timeline = webShowcase.beats[1]!.clip.timeline;
    const hasFocusId = timeline.some((e) => e.kind === 'focusId');
    expect(hasFocusId).toBe(true);
  });

  it('beat 3 clip has NO focusId cue (flyToClip only)', () => {
    // beat index 2 is the M87 dive — flyToClip produces only camera cues,
    // no focusId. The Virgo focus from beat 2 persists across beat 3.
    const timeline = webShowcase.beats[2]!.clip.timeline;
    const hasFocusId = timeline.some((e) => e.kind === 'focusId');
    expect(hasFocusId).toBe(false);
  });
});
