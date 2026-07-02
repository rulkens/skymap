/**
 * webShowcase tests — pin the "named cosmic web" tour's structure: three beats,
 * each with a clip + caption + dwell, with the scene strip riding beat 1's clip.
 *
 * These assert on the beat data (it IS plain data) — the clip structure, captions,
 * and the in-clip scene strip — without running the tour saga. The end-to-end
 * fly + isolate behaviour is covered by the guided-tour saga suites and the
 * webShowcaseDive integration test.
 */

import { describe, it, expect } from 'vitest';
import { webShowcase } from '../../../../src/data/animation/tours/webShowcase';
import { hide } from '../../../../src/services/engine/animation/effectHelpers';
import { dwellDrift } from '../../../../src/state/tour/dwellDrift';
import type { Effect } from '../../../../src/@types/animation/Effect';

// Flatten an effect tree to its leaf/structural kinds — the focus cue may sit
// inside a seq (focusOn) rather than at the timeline's top level.
function collectKinds(effects: readonly Effect[]): string[] {
  return effects.flatMap((e) => {
    if (e.kind === 'seq' || e.kind === 'all') return [e.kind, ...collectKinds(e.children)];
    if (e.kind === 'fork') return [e.kind, ...collectKinds([e.child])];
    return [e.kind];
  });
}

describe('webShowcase tour', () => {
  it('has three beats with captions and dwell clips', () => {
    expect(webShowcase.beats).toHaveLength(3);
    expect(webShowcase.beats[0]!.caption?.title).toBe('The Milky Way');
    expect(webShowcase.beats[1]!.caption?.title).toBe('The Virgo Cluster');
    expect(webShowcase.beats[2]!.caption?.title).toBe('M87');
    expect(webShowcase.beats[0]!.dwellClip).toEqual(dwellDrift(8));
    expect(webShowcase.beats[1]!.dwellClip).toEqual(dwellDrift(10));
    expect(webShowcase.beats[2]!.dwellClip).toEqual(dwellDrift(10));
  });

  it('each beat carries an enterClip (all three move the camera)', () => {
    for (const beat of webShowcase.beats) {
      expect(beat.enterClip).toBeDefined();
      expect(beat.enterClip!.timeline).toBeDefined();
    }
  });

  it('beat 1 opens with the scene strip: an instant hide of volumes/filaments/labels', () => {
    // The strip rides the first clip (no tour-level setup surface); the
    // guidedTourSaga snapshot/restore pair winds it back at tour end.
    const first = webShowcase.beats[0]!.enterClip!.timeline[0];
    expect(first).toEqual(hide(['volumesMaster', 'filaments', 'surveyLabel'], 0));
  });

  it('beat 2 clip carries a focusId cue (flyAndFocusOnClip)', () => {
    // beat index 1 is the Virgo Cluster beat — flyAndFocusOnClip wraps focusOn,
    // whose seq leads with a focusId cue before the camera-move block.
    expect(collectKinds(webShowcase.beats[1]!.enterClip!.timeline)).toContain('focusId');
  });

  it('beat 3 clip has NO focusId cue (flyToClip only)', () => {
    // beat index 2 is the M87 dive — flyToClip produces only camera cues,
    // no focusId. The Virgo focus from beat 2 persists across beat 3.
    expect(collectKinds(webShowcase.beats[2]!.enterClip!.timeline)).not.toContain('focusId');
  });
});
