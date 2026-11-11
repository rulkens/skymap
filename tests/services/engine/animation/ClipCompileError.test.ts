import { describe, it, expect } from 'vitest';
import { compileClip } from '../../../../src/services/engine/animation/compileClip';
import { ClipCompileError } from '../../../../src/services/engine/animation/ClipCompileError';
import {
  all,
  atFocus,
  atPoint,
  dollyTo,
  flyPath,
  hide,
  seq,
  show,
  spin,
} from '../../../../src/services/engine/animation/effectHelpers';
import { focusId } from '../../../../src/utils/animation/focusId';
import type { ClipData } from '../../../../src/@types/animation/ClipData';

const START = { target: [0, 0, 0] as [number, number, number], yaw: 0, pitch: 0, distance: 100 };

function compileError(timeline: ClipData['timeline']): ClipCompileError {
  try {
    compileClip({ start: START, timeline });
  } catch (e) {
    if (e instanceof ClipCompileError) return e;
    throw e;
  }
  throw new Error('expected compileClip to throw');
}

describe('ClipCompileError', () => {
  it('twoWriters names both clashing effects', () => {
    const e = compileError([all([dollyTo(300, 4), dollyTo(500, 6)])]);
    expect(e.reason).toBe('twoWriters');
    expect(e.paths).toEqual([
      [0, 0],
      [0, 1],
    ]);
    expect(e.spans.map((s) => s.path)).toEqual(
      expect.arrayContaining([
        [0, 0],
        [0, 1],
      ]),
    );
    expect(e.message).toMatch(/single-writer violation on channel 'distance'/);
  });

  it('seqOverlap names the seq', () => {
    const e = compileError([seq([dollyTo(1, 2), dollyTo(2, 2)], { overlap: 3 })]);
    expect(e.reason).toBe('seqOverlap');
    expect(e.paths).toEqual([[0]]);
    expect(e.message).toMatch(/seq at 0s, join 1/);
  });

  it('threeWriters names the three', () => {
    const e = compileError([
      seq([seq([dollyTo(300, 4), dollyTo(600, 4)], { overlap: 2 }), dollyTo(900, 6)], {
        overlap: 3,
      }),
    ]);
    expect(e.reason).toBe('threeWriters');
    expect(e.paths).toEqual([
      [0, 0, 0],
      [0, 0, 1],
      [0, 1],
    ]);
  });

  it('cueOrder names the cue', () => {
    const X = 'label:body:planet';
    const e = compileError([
      seq([seq([dollyTo(300, 4), hide([X])]), seq([show([X]), spin('yaw', { by: 1, over: 4 })])], {
        overlap: 1,
      }),
    ]);
    expect(e.reason).toBe('cueOrder');
    expect(e.paths).toEqual([[0, 1, 0]]);
  });

  it('compositeClash names the composite and the base writer', () => {
    const e = compileError([
      all([flyPath([atPoint([10, 0, 0], 10)], { over: 4 }), dollyTo(50, 4)]),
    ]);
    expect(e.reason).toBe('compositeClash');
    expect(e.paths).toEqual([
      [0, 0],
      [0, 1],
    ]);
  });

  it('flyPath names the flyPath', () => {
    const e = compileError([dollyTo(50, 2), flyPath([], { over: 4 })]);
    expect(e.reason).toBe('flyPath');
    expect(e.paths).toEqual([[1]]);
    expect(e.spans.map((s) => s.path)).toEqual([[0]]);
    expect(e.message).toMatch(/at least one waypoint/);
  });

  it('an unresolved flyPath waypoint stays a plain Error: a programmer error, not a draft error', () => {
    const thrown = (() => {
      try {
        compileClip({ timeline: [flyPath([atFocus(focusId('m87'))], { over: 4 })] });
      } catch (e) {
        return e;
      }
    })();
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(ClipCompileError);
  });
});
