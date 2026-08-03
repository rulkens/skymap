/**
 * deriveMilkyWayFade — three facts a wrong number here would hide completely:
 * the Sun anchor's SIGN (a flip puts it 16 kpc the wrong way and still fades
 * plausibly), the `'none'` anchor keeping the readout live while the bands are
 * off, and the approach band's slider-units → Mpc conversion.
 */
import { describe, expect, it } from 'vitest';

import { deriveMilkyWayFade } from '../../../../../tools/galaxy-renderer/src/engine/frame/deriveMilkyWayFade';
import { MILKY_WAY_MODEL_SCALE } from '../../../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';

const FOV = (45 * Math.PI) / 180;
const VIEWPORT_H = 900;

/** Sgr A* sits 0.008 Mpc from the Sun (`galacticCenter.ts`) — 8.0 kpc. */
const SUN_TO_CENTRE_MPC = 0.008;

const bands = {
  anchor: 'galacticCentre',
  enabled: true,
  approachFullAt: 20,
  approachGoneAt: 10,
  fullPx: 12,
  gonePx: 8,
} as const;

describe('deriveMilkyWayFade', () => {
  it('puts the Sun anchor at -x, so an eye parked on it is 0 kpc from the Sun and 8 from the centre', () => {
    const eye: [number, number, number] = [-SUN_TO_CENTRE_MPC / MILKY_WAY_MODEL_SCALE, 0, 0];

    const fade = deriveMilkyWayFade(eye, FOV, VIEWPORT_H, { ...bands, anchor: 'sun' });

    // A +x anchor would read 16 kpc here and 8 there — same order of magnitude,
    // no error, wrong galaxy half.
    expect(fade.anchorDistKpc).toBeCloseTo(0, 6);
    expect(fade.centreDistKpc).toBeCloseTo(8, 6);
  });

  it("keeps measuring under anchor 'none' while holding the cloud at full strength", () => {
    const fade = deriveMilkyWayFade([0, 0, 30], FOV, VIEWPORT_H, { ...bands, anchor: 'none' });

    expect(fade.alpha).toBe(1);
    // The readout is the section's A/B against no fade at all, so the pixel
    // size it compares has to keep tracking rather than short-circuit to 0.
    expect(fade.apparentPx).toBeGreaterThan(0);
    expect(Number.isFinite(fade.apparentPx)).toBe(true);
  });

  it('reads the approach edges as GENERATOR units, not Mpc', () => {
    // 15 units sits halfway between the 10 and 20 unit edges, and smoothstep's
    // midpoint is 0.5 — so the whole band lands on 0.5 exactly. At 15 units the
    // disc is thousands of px across, so the apparent band contributes 1.
    // Without the Mpc conversion the edges would be ~2000x the distance and the
    // band would read a flat 0.
    const fade = deriveMilkyWayFade([0, 0, 15], FOV, VIEWPORT_H, bands);

    expect(fade.apparent).toBe(1);
    expect(fade.approach).toBeCloseTo(0.5, 12);
    expect(fade.alpha).toBeCloseTo(0.5, 12);
  });
});
