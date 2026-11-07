import { describe, it, expect } from 'vitest';
import { compileClip } from '../../../../src/services/engine/animation/compileClip';
import {
  seq,
  dollyTo,
  spin,
  show,
  hide,
  fade,
} from '../../../../src/services/engine/animation/effectHelpers';
import type { Effect } from '../../../../src/@types/animation/Effect';

const X = 'label:body:planet';
const OTHER = 'flow';

// Step 1 ends with `closing` at its own end (4s); step 2 opens with `opening` at
// the overlapped start (3s): written order and firing order disagree.
const compile = (closing: Effect, opening: Effect, overlap = 1) =>
  compileClip({
    timeline: [
      seq([seq([dollyTo(300, 4), closing]), seq([opening, spin('yaw', { by: 1, over: 4 })])], {
        overlap,
      }),
    ],
  });

describe('validateSeqCueOrder', () => {
  it('throws when an overlap fires a later show before an earlier hide of the same layer', () => {
    expect(() => compile(hide([X]), show([X]))).toThrow(/seq at 0s, join 1/);
  });

  it('passes when the keys differ', () => {
    expect(() => compile(hide([X]), show([OTHER]))).not.toThrow();
  });

  it('passes at equal times', () => {
    expect(() => compile(hide([X]), show([X]), 0)).not.toThrow();
  });

  it('ignores fade cues', () => {
    expect(() => compile(fade(['label:body'], 0, 1), fade(['label:body'], 1, 1))).not.toThrow();
  });
});
