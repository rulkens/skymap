/**
 * rowFor / climbRowFor — the table's only narrowing (spec §2.6.3). The two `as`
 * expressions are the one thing the compiler cannot check, so a mis-keyed table
 * would dispatch a frame to the wrong rung in silence; keying each answered
 * row's own `kind` against `rungKindOf` is what catches that.
 */

import { describe, it, expect } from 'vitest';

import { rowFor } from '../../../../../src/services/engine/camera/rungs/rowFor';
import { climbRowFor } from '../../../../../src/services/engine/camera/rungs/climbRowFor';
import { rungKindOf } from '../../../../../src/services/engine/camera/rungs/rungKindOf';
import type { PoseFrame } from '../../../../../src/@types/camera/PoseFrame';
import type { BodyId } from '../../../../../src/@types/data/body/BodyId';
import type { FrameOf } from '../../../../../src/@types/camera/FrameOf';

const BODY_FRAME: FrameOf['body'] = { body: 'earth' };
const SITE_FRAME: FrameOf['site'] = { site: 'curiosity' as BodyId };

describe('rowFor', () => {
  it('returns the row whose kind matches rungKindOf, for a frame of each kind', () => {
    const frames: readonly PoseFrame[] = ['absolute', BODY_FRAME, SITE_FRAME];
    for (const frame of frames) {
      expect(rowFor(frame).kind).toBe(rungKindOf(frame));
    }
  });
});

describe('climbRowFor', () => {
  it('returns the row whose kind matches rungKindOf', () => {
    expect(climbRowFor(BODY_FRAME).kind).toBe(rungKindOf(BODY_FRAME));
    expect(climbRowFor(SITE_FRAME).kind).toBe(rungKindOf(SITE_FRAME));
  });
});
