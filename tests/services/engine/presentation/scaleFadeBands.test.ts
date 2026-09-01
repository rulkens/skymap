/**
 * scaleFadeBands — pins the two POP-FREE relationships between the star fade
 * bands and the gates they hand off to. Both couple constants that are tuned in
 * SEPARATE files (`scaleFadeBands`, `solarSystemLabelMaxDistance`,
 * `foregroundMaxDistance`), so each fails on a silent retune of one margin that
 * would reintroduce a visible pop on descent — the exact regression this fix
 * removed. These are NOT restatements of the derivations (which would assert a
 * band equals `FARTHEST × k`): they assert the cross-file inequality that keeps
 * a fade from outliving the layer it fades within.
 */

import { describe, it, expect } from 'vitest';

import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../src/services/engine/frame/foregroundMaxDistance';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../../../../src/services/engine/frame/solarSystemLabelMaxDistance';
import { regionById } from '../../../../src/utils/scene/regionById';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { fadeBand } from '../../../../src/utils/math/fadeBand';

const NEIGHBOURHOOD_EXTENT_MPC = regionById('solar-neighbourhood').extentMpc;
const SOLAR_SYSTEM_EXTENT_MPC = regionById('solar-system').extentMpc;

describe('star fade bands — pop-free coupling to their gates', () => {
  it('the star caption reaches 0 before its layer gate cuts it', () => {
    // Worst-case star-to-camera distance at the caption gate crossing is
    // `gate − 2·EXTENT` (camera `gate` from a target star sitting `EXTENT` from
    // the region's anchor, another seed up to `2·EXTENT` beyond it). For no
    // caption to still be fading when the layer switches off, the band's `goneAt`
    // (in Mpc) must not exceed that lower bound — i.e.
    // `goneAt·PC_TO_MPC + 2·EXTENT ≤ gate`. A retune that widened the caption
    // band or tightened the gate would surface a half-faded caption with a hard
    // edge at the gate; this catches it.
    const captionGoneMpc = SCALE_FADE_BANDS.starCaption.goneAt * SCALE_UNITS.PC_TO_MPC;
    expect(captionGoneMpc + 2 * NEIGHBOURHOOD_EXTENT_MPC).toBeLessThanOrEqual(
      SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC,
    );
  });

  it('the star backdrop dissolves fully inside the shared foreground gate', () => {
    // The backdrop band must complete STRICTLY before `FOREGROUND_MAX_DISTANCE_MPC`
    // hard-cuts the layer, so the gate lands on already-black sprites and never
    // pops. A retune that pushed `goneAt` out to (or past) the gate would
    // reintroduce the hard-cut blob this fix dissolved.
    expect(SCALE_FADE_BANDS.starBackdrop.goneAt).toBeLessThan(FOREGROUND_MAX_DISTANCE_MPC);
  });

  it('the body-glint backdrop dissolves fully inside the shared foreground gate', () => {
    // The same pop-free property as the star backdrop, one scale-decade down: the
    // body-glint far-dissolve must complete STRICTLY before the shared foreground
    // gate hard-cuts the layer, so the gate lands on already-dark glints. A retune
    // that pushed `goneAt` out to (or past) the gate would reintroduce the bright-
    // blob pop this fix removed (all ~22 glints collapsed onto one dot into
    // Milky-Way framing).
    expect(SCALE_FADE_BANDS.bodyGlintBackdrop.goneAt).toBeLessThan(FOREGROUND_MAX_DISTANCE_MPC);
  });
});

describe('both backdrop bands derive from one shape', () => {
  it('starBackdrop and bodyGlintBackdrop apply the same fullAt/goneAt multiple to their own region extent', () => {
    // Neither ratio is hardcoded here — only that the two bands, each keyed on a
    // DIFFERENT region extent (solar-neighbourhood vs. solar-system), come out
    // to the SAME multiple. If a future edit re-inlined one band's multiplier
    // independently of the other's (the bug this shape consolidation removes),
    // the two ratios would diverge and this would fail; retuning the shared
    // shape moves both ratios together and stays green.
    expect(SCALE_FADE_BANDS.starBackdrop.fullAt / NEIGHBOURHOOD_EXTENT_MPC).toBe(
      SCALE_FADE_BANDS.bodyGlintBackdrop.fullAt / SOLAR_SYSTEM_EXTENT_MPC,
    );
    expect(SCALE_FADE_BANDS.starBackdrop.goneAt / NEIGHBOURHOOD_EXTENT_MPC).toBe(
      SCALE_FADE_BANDS.bodyGlintBackdrop.goneAt / SOLAR_SYSTEM_EXTENT_MPC,
    );
  });
});

describe('sgrAStarLensing band', () => {
  // The DIRECTION is the load-bearing fact: `fullAt < goneAt` makes this an
  // approach fade, so the lens engages as the camera closes on Sgr A*. Edges
  // swapped, it would fade OUT on approach — the opposite of the effect — and
  // still type-check. Read off the band itself, so an intentional retune of
  // where the envelope sits stays green.
  it('fades IN on approach, monotonically across the envelope', () => {
    const { fullAt, goneAt } = SCALE_FADE_BANDS.sgrAStarLensing;
    expect(fullAt).toBeLessThan(goneAt);

    const midpoint = (fullAt + goneAt) / 2;
    const nearMid = (fullAt + midpoint) / 2;
    expect(fadeBand(SCALE_FADE_BANDS.sgrAStarLensing, fullAt)).toBe(1);
    expect(fadeBand(SCALE_FADE_BANDS.sgrAStarLensing, goneAt)).toBe(0);
    expect(fadeBand(SCALE_FADE_BANDS.sgrAStarLensing, nearMid)).toBeGreaterThan(
      fadeBand(SCALE_FADE_BANDS.sgrAStarLensing, midpoint),
    );
    expect(fadeBand(SCALE_FADE_BANDS.sgrAStarLensing, midpoint)).toBeGreaterThan(0);
    expect(fadeBand(SCALE_FADE_BANDS.sgrAStarLensing, midpoint)).toBeLessThan(1);
  });
});
