/**
 * nextZoomBiasAnchor — reference-identity capture for the zoom-bias anchor
 * (spec §4.2's "written once, at zoom-gesture start … not re-picked every
 * tick"). `hoveredSurfacePoint` is recomputed only on `pointermove`
 * (`wireInput.ts`), so its object reference is stable across an entire
 * wheel/pinch burst where the pointer does not move — this function
 * exploits exactly that stability, mirroring `hoverPickDriver.ts`'s
 * `latest === picked` reference-identity idiom.
 */

import { describe, it, expect } from 'vitest';
import { nextZoomBiasAnchor } from '../../../src/utils/camera/nextZoomBiasAnchor';
import type { BodyId } from '../../../src/@types/data/body/BodyId';

const EARTH = 'body-earth' as BodyId;

describe('nextZoomBiasAnchor', () => {
  it('recaptures on a fresh hover reference', () => {
    const lastCaptureSource = { bodyId: EARTH, point: { lonDeg: 10, latDeg: 20 } };
    const hoveredNow = { bodyId: EARTH, point: { lonDeg: 10, latDeg: 20 } };
    expect(hoveredNow).not.toBe(lastCaptureSource); // distinct objects, same values

    const result = nextZoomBiasAnchor(null, lastCaptureSource, hoveredNow);

    expect(result.anchor).toBe(hoveredNow);
    expect(result.captureSource).toBe(hoveredNow);
  });

  it('holds the anchor when the hover reference is unchanged', () => {
    const hoveredNow = { bodyId: EARTH, point: { lonDeg: 10, latDeg: 20 } };
    const currentAnchor = { bodyId: EARTH, point: { lonDeg: 1, latDeg: 2 } };

    // lastCaptureSource === hoveredNow: already captured this exact reference.
    const result = nextZoomBiasAnchor(currentAnchor, hoveredNow, hoveredNow);

    expect(result.anchor).toBe(currentAnchor);
  });

  it('holds the anchor when hoveredNow is null', () => {
    const currentAnchor = { bodyId: EARTH, point: { lonDeg: 1, latDeg: 2 } };
    const lastCaptureSource = { bodyId: EARTH, point: { lonDeg: 1, latDeg: 2 } };

    const result = nextZoomBiasAnchor(currentAnchor, lastCaptureSource, null);

    expect(result.anchor).toBe(currentAnchor);
  });
});
