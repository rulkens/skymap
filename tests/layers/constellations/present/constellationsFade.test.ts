/**
 * constellationsFade / constellationsBand — the three call sites collapsed
 * (constellationsPass `enabled`/`draw`, produceConstellationCaptions) used
 * to hand-compute the same band×toggle product independently; this pins the
 * shared formula's actual behaviour, not just that it compiles.
 */

import { describe, it, expect } from 'vitest';

import { constellationsBand } from '../../../../src/layers/constellations/present/constellationsBand';
import { constellationsFade } from '../../../../src/layers/constellations/present/constellationsFade';
import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';

import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
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

// `focusRecession` and the clip factor are both neutral (1) for the
// `constellations` kind — see `focusRecession.ts`'s RECESSION_BY_KIND and
// `fadeIdToVisibilityKey`'s mapping — so this stub isolates the toggle term.
function makeState(toggle: number): Pick<EngineState, 'subsystems'> {
  return {
    subsystems: {
      fades: { opacityOf: () => toggle },
      clipPlayer: { clipOpacityOf: () => 1 },
    },
  } as unknown as Pick<EngineState, 'subsystems'>;
}

describe('constellationsFade / constellationsBand', () => {
  it('zeroes the product once the camera clears the band, at any toggle', () => {
    const ctx = makeCtx(BAND.goneAt * 10);
    expect(constellationsBand(ctx)).toBe(0);
    expect(constellationsFade(makeState(1), ctx)).toBe(0);
  });

  it('scales the mid-band product by the layer toggle', () => {
    const ctx = makeCtx(MID_BAND_DIST_MPC);
    const band = constellationsBand(ctx);
    expect(band).toBeGreaterThan(0);
    expect(band).toBeLessThan(1);
    expect(constellationsFade(makeState(0.6), ctx)).toBeCloseTo(band * 0.6, 10);
  });

  it('constellationsBand ignores the toggle that constellationsFade applies', () => {
    const ctx = makeCtx(MID_BAND_DIST_MPC);
    const band = constellationsBand(ctx);

    const lowToggle = constellationsFade(makeState(0.2), ctx);
    const highToggle = constellationsFade(makeState(0.9), ctx);

    expect(constellationsBand(ctx)).toBe(band);
    expect(lowToggle).toBeCloseTo(band * 0.2, 10);
    expect(highToggle).toBeCloseTo(band * 0.9, 10);
    expect(lowToggle).not.toBe(highToggle);
  });
});
