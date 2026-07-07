import { describe, expect, it } from 'vitest';
import { clipDurationSec } from '../../../../tools/utils/animation/clipDurationSec';
import { compileClip } from '../../../../src/services/engine/animation/compileClip';
import { all, dollyToId, lookAtId, seq, wait } from '../../../../src/services/engine/animation/effectHelpers';
import { focusId } from '../../../../src/utils/animation/focusId';
import { dwellDrift } from '../../../../src/state/tour/dwellDrift';
import { tourRegistry } from '../../../../src/data/animation/tours/tourRegistry';
import type { ClipData } from '../../../../src/@types/animation/ClipData';

describe('clipDurationSec', () => {
  it('matches compileClip for a clip with nothing to resolve', () => {
    const clip = dwellDrift(8);
    expect(clipDurationSec(clip)).toBe(compileClip(clip).durationSec);
  });

  it('measures a clip with unresolved foci that compileClip alone rejects', () => {
    const VIRGO = focusId('cluster-virgo-m87');
    const clip: ClipData = {
      timeline: [wait(2), seq([lookAtId(VIRGO, 3), all([dollyToId(VIRGO, 7)])])],
    };
    expect(() => compileClip(clip)).toThrow(/resolveClipFoci/);
    expect(clipDurationSec(clip)).toBe(12);
  });

  it('measures every beat of every registered tour', () => {
    // The invariant the tour-length tool relies on: any beat authored into
    // the registry stays statically measurable — no clip shape may sneak in
    // that needs live data to compile.
    for (const tour of Object.values(tourRegistry)) {
      for (const beat of tour.beats) {
        const enter = beat.enterClip ? clipDurationSec(beat.enterClip) : 0;
        const dwell = clipDurationSec(beat.dwellClip);
        expect(Number.isFinite(enter + dwell)).toBe(true);
        expect(dwell).toBeGreaterThan(0);
      }
    }
  });
});
