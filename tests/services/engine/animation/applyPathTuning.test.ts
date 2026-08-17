/**
 * applyPathTuning — bakes the inspector's live align / rampSec (seconds) sliders
 * into a clip's `flyPath` nodes (recursively through seq/all/fork), so the pinned
 * and replayed clip carries the tuning. Non-flyPath clips pass through unchanged.
 */

import { describe, it, expect } from 'vitest';
import { applyPathTuning } from '../../../../src/services/engine/animation/applyPathTuning';
import {
  flyPath,
  atPoint,
  dollyTo,
  seq,
  all,
} from '../../../../src/services/engine/animation/effectHelpers';
import type { ClipData } from '../../../../src/@types/animation/ClipData';

const TUNING = {
  align: 0.7,
  rampSec: 1.2,
  linger: 0.3,
  lingerSec: 3,
  spline: { kind: 'causalHermite', turnDelay: 1.5 } as const,
  passBy: { offset: 4, dir: 'above' } as const,
};

describe('applyPathTuning', () => {
  it('injects align + rampSec (seconds) into a top-level flyPath', () => {
    const clip: ClipData = {
      start: 'live',
      timeline: [flyPath([atPoint([10, 0, 0], 5)], { over: 8, ease: 'easeInOutCubic' })],
    };
    const tuned = applyPathTuning(clip, TUNING);
    const node = tuned.timeline[0] as Extract<(typeof tuned.timeline)[number], { kind: 'flyPath' }>;
    expect(node.kind).toBe('flyPath');
    expect(node.align).toBe(0.7);
    expect(node.rampSec).toBe(1.2);
    expect(node.linger).toBe(0.3);
    expect(node.lingerSec).toBe(3);
    expect(node.spline).toEqual({ kind: 'causalHermite', turnDelay: 1.5 });
    expect(node.passBy).toEqual({ offset: 4, dir: 'above' });
    expect(node.over).toBe(8); // other fields preserved
  });

  it('reaches a flyPath nested inside seq/all', () => {
    const clip: ClipData = {
      start: 'live',
      timeline: [seq([all([flyPath([atPoint([1, 2, 3], 4)], { over: 5, ease: 'easeOutCubic' })])])],
    };
    const tuned = applyPathTuning(clip, TUNING);
    const seqNode = tuned.timeline[0] as Extract<(typeof tuned.timeline)[number], { kind: 'seq' }>;
    const allNode = seqNode.children[0] as Extract<
      (typeof seqNode.children)[number],
      { kind: 'all' }
    >;
    const fly = allNode.children[0] as Extract<
      (typeof allNode.children)[number],
      { kind: 'flyPath' }
    >;
    expect(fly.align).toBe(0.7);
    expect(fly.rampSec).toBe(1.2);
    expect(fly.linger).toBe(0.3);
    expect(fly.spline).toEqual({ kind: 'causalHermite', turnDelay: 1.5 });
  });

  it('overwrites a flyPath that already carries its own align/rampSec', () => {
    const clip: ClipData = {
      start: 'live',
      timeline: [flyPath([atPoint([10, 0, 0], 5)], { over: 8, align: 2, rampSec: 3 })],
    };
    const tuned = applyPathTuning(clip, TUNING);
    const node = tuned.timeline[0] as Extract<(typeof tuned.timeline)[number], { kind: 'flyPath' }>;
    expect(node.align).toBe(0.7);
    expect(node.rampSec).toBe(1.2);
    expect(node.linger).toBe(0.3);
  });

  it('leaves a flyPath-free clip unchanged', () => {
    const clip: ClipData = {
      start: 'live',
      timeline: [dollyTo(100, 6, 'easeInOutCubic')],
    };
    expect(applyPathTuning(clip, TUNING)).toEqual(clip);
  });

  it('overrides only the present knobs, keeping the clip authored values for the rest', () => {
    // The inspector passes only the ACTIVATED knobs. An omitted knob must keep
    // the clip's own value — this is what lets a Calculate preview the clip's
    // real pacing rather than the inspector's seeded defaults.
    const clip: ClipData = {
      start: 'live',
      timeline: [
        flyPath([atPoint([10, 0, 0], 5)], {
          over: 8,
          align: 2,
          rampSec: 3,
          linger: 0.65,
          spline: { kind: 'causalHermite', turnDelay: 1 },
        }),
      ],
    };
    // Activate ONLY linger.
    const tuned = applyPathTuning(clip, { linger: 0.1 });
    const node = tuned.timeline[0] as Extract<(typeof tuned.timeline)[number], { kind: 'flyPath' }>;
    expect(node.linger).toBe(0.1); // overridden
    expect(node.align).toBe(2); // untouched (clip's value)
    expect(node.rampSec).toBe(3); // untouched
    expect(node.spline).toEqual({ kind: 'causalHermite', turnDelay: 1 }); // untouched
  });

  it('is a no-op for an empty tuning (no knob activated)', () => {
    const clip: ClipData = {
      start: 'live',
      timeline: [flyPath([atPoint([10, 0, 0], 5)], { over: 8, linger: 0.65 })],
    };
    expect(applyPathTuning(clip, {})).toEqual(clip);
  });
});
