/**
 * hostedFocusOverHorizon — the body arm's "can I still serve this focus?" test
 * (spec §4.8). Two rovers 142° of Mars apart is the case it exists for; the
 * floor lift is the case that decides whether the arrival can land at all.
 */

import { describe, it, expect } from 'vitest';

import { hostedFocusOverHorizon } from '../../../src/utils/camera/hostedFocusOverHorizon';
import { siteGroundRadiusM } from '../../../src/utils/camera/siteGroundRadiusM';
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
  groundRadiusAtM: () => MARS_ROW.surface.datumRadiusM,
  standoffRadii: bodyStandoffRadii(MARS_ROW),
};

const sitePoint = (id: string): Vec3 => {
  const site = SURFACE_FIXED_SITES.find((s) => s.id === id)!;
  return sitePointBodyFixed(site, siteGroundRadiusM(site, MARS.radiusM));
};

/** `metresUp` above the site, radially — the eye a landed camera has. */
const over = (id: string, metresUp: number): Vec3 => {
  const p = sitePoint(id);
  const mag = Math.hypot(p[0], p[1], p[2]);
  const k = (mag + metresUp) / mag;
  return [p[0] * k, p[1] * k, p[2] * k];
};

describe('hostedFocusOverHorizon', () => {
  it('a rover on the far side of the planet is over the horizon', () => {
    // Curiosity from 60 m over Opportunity: 142° around
    // Mars. Held, the arm serves a point it cannot show and no driver is live.
    expect(hostedFocusOverHorizon(over('opportunity', 60), 'curiosity' as BodyId, MARS)).toBe(true);
  });

  it('a rover under the eye is not', () => {
    expect(hostedFocusOverHorizon(over('curiosity', 60), 'curiosity' as BodyId, MARS)).toBe(false);
    expect(hostedFocusOverHorizon(over('curiosity', 1e6), 'curiosity' as BodyId, MARS)).toBe(false);
  });

  it('an eye under the site is judged from ITS floor, not the bare datum (F4)', () => {
    // The follow approach arrives along the chord and parks the eye a few
    // metres below the site's own (baked, well above the bare datum) ground.
    // Read literally, every point on the planet is behind the eye's horizon
    // and the arm refuses the arrival it exists to land — so the eye is
    // lifted to the SITE's floor, not the planet's much lower generic one.
    const p = sitePoint('curiosity');
    const mag = Math.hypot(p[0], p[1], p[2]);
    const sunk = (mag - 9.3) / mag;
    const eye: Vec3 = [p[0] * sunk, p[1] * sunk, p[2] * sunk];
    const bareDatumFloorM = surfaceFloorM(MARS.radiusM, MARS.standoffRadii);
    const siteFloorM = surfaceFloorM(mag, MARS.standoffRadii);
    expect(Math.hypot(...eye)).toBeLessThan(siteFloorM);
    // Well above the bare-datum floor — this eye is nowhere near underground
    // by the planet's own generic standard, only by the site's own altitude.
    expect(Math.hypot(...eye)).toBeGreaterThan(bareDatumFloorM);
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
