/**
 * hostedFocusOverHorizon — the body arm's "can I still serve this focus?" test
 * (spec §4.8). Two rovers 142° of Mars apart is the case it exists for; the
 * floor lift is the case that decides whether the arrival can land at all.
 */

import { describe, it, expect } from 'vitest';

import { hostedFocusOverHorizon } from '../../../src/utils/camera/hostedFocusOverHorizon';
import { sitePointBodyFixed } from '../../../src/utils/camera/sitePointBodyFixed';
import { surfaceFloorM } from '../../../src/utils/camera/surfaceFloorM';
import { bodyStandoffRadii } from '../../../src/utils/scene/bodyStandoffRadii';
import { SURFACE_FIXED_SITES } from '../../../src/data/bodies/surfaceFixedSites';
import { SCENE_CELESTIAL_BODIES } from '../../../src/data/bodies/sceneCelestialBodies';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import type { BodyId } from '../../../src/@types/data/body/BodyId';
import type { HostBody } from '../../../src/@types/camera/HostBody';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const MARS_ROW = SCENE_CELESTIAL_BODIES.find((row) => row.id === 'mars')!;
const MARS: HostBody = {
  id: 'mars' as BodyId,
  state: deriveBodyStates(CONST_J2000).get('mars')!,
  radiusM: MARS_ROW.surface.datumRadiusM,
  standoffRadii: bodyStandoffRadii(MARS_ROW),
};

const sitePoint = (id: string): Vec3 =>
  sitePointBodyFixed(SURFACE_FIXED_SITES.find((s) => s.id === id)!, MARS.radiusM);

/** `metresUp` above the site, radially — the eye a landed camera has. */
const over = (id: string, metresUp: number): Vec3 => {
  const p = sitePoint(id);
  const mag = Math.hypot(p[0], p[1], p[2]);
  const k = (mag + metresUp) / mag;
  return [p[0] * k, p[1] * k, p[2] * k];
};

describe('hostedFocusOverHorizon', () => {
  it('a rover on the far side of the planet is over the horizon', () => {
    // Bradbury Landing from 60 m over Challenger Memorial Station: 142° around
    // Mars. Held, the arm serves a point it cannot show and no driver is live.
    expect(hostedFocusOverHorizon(over('opportunity', 60), 'curiosity' as BodyId, MARS)).toBe(true);
  });

  it('a rover under the eye is not', () => {
    expect(hostedFocusOverHorizon(over('curiosity', 60), 'curiosity' as BodyId, MARS)).toBe(false);
    expect(hostedFocusOverHorizon(over('curiosity', 1e6), 'curiosity' as BodyId, MARS)).toBe(false);
  });

  it('an eye under the datum is judged from the descent floor', () => {
    // The follow approach arrives along the chord and parks the eye ~9 m BELOW
    // Mars's datum, metres from the rover. Read literally, every point on the
    // planet is behind the eye's horizon and the arm refuses the arrival it
    // exists to land — so the eye is lifted to the floor `flooredBodyPose`
    // would push it to anyway.
    const p = sitePoint('curiosity');
    const mag = Math.hypot(p[0], p[1], p[2]);
    const sunk = (mag - 9.3) / mag;
    const eye: Vec3 = [p[0] * sunk, p[1] * sunk, p[2] * sunk];
    expect(Math.hypot(...eye)).toBeLessThan(surfaceFloorM(MARS.radiusM, MARS.standoffRadii));
    expect(hostedFocusOverHorizon(eye, 'curiosity' as BodyId, MARS)).toBe(false);
  });

  it('a focus that is not hosted on this body never releases it', () => {
    // The host itself, an orbiting moon and no focus at all: the subtree rule
    // owns those cells, and answering true here would release every body arm.
    for (const focus of ['mars', 'phobos', 'earth', null]) {
      expect(hostedFocusOverHorizon(over('curiosity', 60), focus as BodyId | null, MARS)).toBe(
        false,
      );
    }
  });
});
