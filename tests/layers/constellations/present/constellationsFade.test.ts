/**
 * constellationsFade / constellationsBand — the three call sites collapsed
 * (constellationsPass `enabled`/`draw`, produceConstellationCaptions) used
 * to hand-compute the same band × value product independently; this pins the
 * shared formula's actual behaviour, not just that it compiles.
 */

import { describe, it, expect } from 'vitest';

import { constellationsBand } from '../../../../src/layers/constellations/present/constellationsBand';
import { constellationsFade } from '../../../../src/layers/constellations/present/constellationsFade';
import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';

import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const BAND = SCALE_FADE_BANDS.constellations;
const MID_BAND_DIST_MPC = (BAND.fullAt + BAND.goneAt) / 2;

function makeCtx(camDistMpc: number): FrameView {
  const camPos: Vec3 = [camDistMpc, 0, 0];
  return {
    drawCamPos: camPos,
    snapshot: { focusBlend: 0, nowMs: 0 },
  } as unknown as FrameView;
}

describe('constellationsFade / constellationsBand', () => {
  it('zeroes the product once the camera clears the band, at any toggle', () => {
    const ctx = makeCtx(BAND.goneAt * 10);
    expect(constellationsBand(ctx)).toBe(0);
    expect(constellationsFade(ctx, 1)).toBe(0);
  });

  it('scales the mid-band product by the handed value', () => {
    const ctx = makeCtx(MID_BAND_DIST_MPC);
    const band = constellationsBand(ctx);
    expect(band).toBeGreaterThan(0);
    expect(band).toBeLessThan(1);
    expect(constellationsFade(ctx, 0.6)).toBeCloseTo(band * 0.6, 10);
  });

  it('constellationsBand ignores the value that constellationsFade applies', () => {
    const ctx = makeCtx(MID_BAND_DIST_MPC);
    const band = constellationsBand(ctx);

    const lowToggle = constellationsFade(ctx, 0.2);
    const highToggle = constellationsFade(ctx, 0.9);

    expect(constellationsBand(ctx)).toBe(band);
    expect(lowToggle).toBeCloseTo(band * 0.2, 10);
    expect(highToggle).toBeCloseTo(band * 0.9, 10);
    expect(lowToggle).not.toBe(highToggle);
  });
});
