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
import {
  FARTHEST_BODY_MPC,
  FOREGROUND_MAX_DISTANCE_MPC,
} from '../../../../src/services/engine/frame/foregroundMaxDistance';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../../../../src/services/engine/frame/solarSystemLabelMaxDistance';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';

describe('star fade bands — pop-free coupling to their gates', () => {
  it('the star caption reaches 0 before its layer gate cuts it', () => {
    // Worst-case star-to-camera distance at the caption gate crossing is
    // `gate − 2·FARTHEST` (camera `gate` from a target star sitting `FARTHEST`
    // from the origin, another seed up to `2·FARTHEST` beyond it). For no
    // caption to still be fading when the layer switches off, the band's `goneAt`
    // (in Mpc) must not exceed that lower bound — i.e.
    // `goneAt·PC_TO_MPC + 2·FARTHEST ≤ gate`. A retune that widened the caption
    // band or tightened the gate would surface a half-faded caption with a hard
    // edge at the gate; this catches it.
    const captionGoneMpc = SCALE_FADE_BANDS.starCaption.goneAt * SCALE_UNITS.PC_TO_MPC;
    expect(captionGoneMpc + 2 * FARTHEST_BODY_MPC).toBeLessThanOrEqual(
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
