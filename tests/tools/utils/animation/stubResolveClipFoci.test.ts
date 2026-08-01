import { describe, expect, it } from 'vitest';
import { stubResolveClipFoci } from '../../../../tools/utils/animation/stubResolveClipFoci';
import { compileClip } from '../../../../src/services/engine/animation/compileClip';
import {
  all,
  atFocus,
  atPoint,
  dollyTo,
  dollyToId,
  flyPath,
  focus,
  hold,
  lookAtId,
  moveTargetId,
  seq,
  spinToId,
  strafeId,
} from '../../../../src/services/engine/animation/effectHelpers';
import { focusId } from '../../../../src/utils/animation/focusId';
import type { ClipData } from '../../../../src/@types/animation/ClipData';

const M31 = focusId('m31');

describe('stubResolveClipFoci', () => {
  it('passes an already-concrete clip through unchanged', () => {
    const clip: ClipData = {
      timeline: [seq([dollyTo(0.5, 4), hold(2)]), flyPath([atPoint([1, 2, 3], 0.4)], { over: 6 })],
    };
    expect(stubResolveClipFoci(clip)).toEqual(clip);
  });

  it('rewrites focus-bound arms duration-neutrally', () => {
    // The same composition shape the grand-tour approach beats use: the
    // stubbed clip must compile to the sum of the authored `over` windows,
    // exactly as the genuinely-resolved clip would.
    const clip: ClipData = {
      timeline: [
        focus(M31), // point cue — contributes 0
        all([lookAtId(M31, 3), strafeId(M31, 10, 3)]), // max(3, 3)
        all([moveTargetId(M31, 6), dollyToId(M31, 6, { scale: 0.7 })]), // max(6, 6)
      ],
    };
    expect(compileClip(stubResolveClipFoci(clip)).durationSec).toBe(9);
  });

  it('rewrites spinToId duration-neutrally too', () => {
    // Without a spinToId case, stubEffect's pass-through default leaves the
    // id-bearing leaf in place and compileClip throws (unresolved spinToId) —
    // the exact regression this pins.
    const clip: ClipData = { timeline: [spinToId(M31, { over: 4 })] };
    expect(compileClip(stubResolveClipFoci(clip)).durationSec).toBe(4);
  });

  it('substitutes id-form flyPath waypoints so the path compiles, dwell included', () => {
    const clip: ClipData = {
      timeline: [
        flyPath([atFocus(M31), atFocus(focusId('m81')), atFocus(focusId('m101'))], {
          over: 20,
          linger: 0.8,
          lingerSec: 2.5,
        }),
      ],
    };
    const dur = compileClip(stubResolveClipFoci(clip)).durationSec;
    // Lingering ADDS wall time to the cruise budget; the exact total depends
    // on the dwell warp, not waypoint geometry.
    expect(dur).toBeGreaterThan(20);
    expect(Number.isFinite(dur)).toBe(true);
  });
});
