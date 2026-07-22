import { describe, expect, it } from 'vitest';
import { constellationCaptions } from '../../../../src/services/engine/presentation/constellationCaptions';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { ConstellationsArtifact } from '../../../../src/@types/loading/ConstellationsArtifact';

// A two-figure fixture: Latin names + parsec-scale anchors. Segments are
// irrelevant to the caption source (the renderer consumes them), so each figure
// carries a single throwaway segment to keep the artifact shape honest.
const ARTIFACT: ConstellationsArtifact = {
  version: 1,
  constellations: [
    {
      name: 'Orion',
      labelAnchorPc: [200, -50, 100],
      segments: [{ aPc: [1, 2, 3], aAppMag: 0.5, bPc: [4, 5, 6], bAppMag: 1.2 }],
    },
    {
      name: 'Ursa Major',
      labelAnchorPc: [-30, 80, 12],
      segments: [{ aPc: [7, 8, 9], aAppMag: 2.0, bPc: [10, 11, 12], bAppMag: 2.4 }],
    },
  ],
};

const PC = SCALE_UNITS.PC_TO_MPC;

describe('constellationCaptions', () => {
  it('builds one caption per figure at its anchor, in the constellation kind', () => {
    const caps = constellationCaptions(ARTIFACT);
    expect(caps).toHaveLength(2);

    expect(caps[0]!.text).toBe('Orion');
    // The anchor ships in PARSECS; the source must scale it into world Mpc
    // (PC_TO_MPC) so the name projects at the same near-field scale as the
    // stick-figure segments (buildConstellationInstances) rather than 1e6× too
    // far and getting culled. This is the anchor-unit regression pin — a real
    // bug (labels vanish) if the scale is dropped.
    expect(caps[0]!.worldPos).toEqual([200 * PC, -50 * PC, 100 * PC]);
    expect(caps[1]!.text).toBe('Ursa Major');
    expect(caps[1]!.worldPos).toEqual([-30 * PC, 80 * PC, 12 * PC]);

    // The kind routes the caption to the annotation-tier declutter priority in
    // the foreground layer; a wrong kind would let a figure name out-rank a body
    // caption, which is the whole reason the tier exists.
    expect(caps.every((c) => c.kind === 'constellation')).toBe(true);
  });

  it('carries no per-caption fade — the foreground layer owns visibility', () => {
    // The source is a pure builder: it emits the STATIC caption set and never
    // reads a camera or a toggle, so no caption is pre-faded. The layer derives
    // each frame's alpha (band × registry × toggle) through the shared envelope.
    // Pinning fadeAlpha absent guards against the fade logic silently creeping
    // back into the source, where it could drift out of lock-step with the
    // stick figures.
    for (const cap of constellationCaptions(ARTIFACT)) {
      expect(cap.fadeAlpha).toBeUndefined();
    }
  });
});
