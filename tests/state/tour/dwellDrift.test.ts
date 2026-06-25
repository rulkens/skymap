/**
 * dwellDrift tests — verify the dwell clip is perpetual and starts live.
 *
 * The perpetual guarantee is structural: the awaited timeline node must be a
 * `spin` with `loop: true`. Any finite-duration node at the top-level awaited
 * position would allow the clip to complete, winning the dwell race and
 * advancing the tour prematurely.
 *
 * The oscillate is forked — it contributes no duration to the timeline and
 * is therefore not part of the awaited path. Tests confirm this by verifying
 * the fork wraps an `osc`, not a finite cue.
 */

import { describe, it, expect } from 'vitest';
import { dwellDrift } from '../../../src/state/tour/dwellDrift';
import type { BeatData } from '../../../src/@types/animation/tour/BeatData';

// Minimal beat — dwellDrift ignores its content but needs a compatible type.
// clip is a trivial narration clip with an empty timeline.
const beat: BeatData = { clip: { start: 'live', timeline: [] }, caption: null, dwellSec: 10 };

describe('dwellDrift', () => {
  it('starts live', () => {
    const clip = dwellDrift(beat);
    expect(clip.start).toBe('live');
  });

  it('builds a perpetual loop clip', () => {
    const clip = dwellDrift(beat);

    // The timeline has exactly two entries: a fork (the bob) and a spin (the orbit).
    expect(clip.timeline).toHaveLength(2);

    // First entry: fork wrapping an oscillate — the bob runs under the awaited spin.
    const forkEntry = clip.timeline[0];
    expect(forkEntry).not.toBeUndefined();
    expect(forkEntry!.kind).toBe('fork');
    if (forkEntry!.kind === 'fork') {
      expect(forkEntry.child.kind).toBe('osc');
    }

    // Second entry: spin with loop: true — the awaited node that never completes.
    const spinEntry = clip.timeline[1];
    expect(spinEntry).not.toBeUndefined();
    expect(spinEntry!.kind).toBe('spin');
    if (spinEntry!.kind === 'spin') {
      expect(spinEntry.loop).toBe(true);
      expect(spinEntry.ch).toBe('yaw');
    }
  });
});
