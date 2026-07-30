import { describe, it, expect } from 'vitest';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { sunDirLocal } from '../../../../src/utils/camera/sunDirLocal';
import { RENDER_ORIGIN_MPC } from '../../../../src/data/renderOrigin';
import { cubeSphereMesh } from '../../../../src/utils/math/cubeSphereMesh';

/**
 * Reproduces the reported bug: with the sim clock live at 2026-07-21T14:00Z, the
 * Blue Marble texel for DENMARK (~10°E, ~56°N) rendered on Earth's NIGHT side,
 * though it is mid-afternoon daylight there.
 *
 * ### Ground truth (derived independently of the code under test)
 *
 * Sub-solar longitude at 14:00 UTC: the Sun crosses the Greenwich meridian near
 * 12:00 UTC and the sub-solar point moves 15°/hour westward, so at 14:00 it sits
 * near -30°. Cross-checked via sidereal time: GMST ≈ 149.3°, the Sun's apparent
 * right ascension ≈ 120.6° (ecliptic longitude ~118.5°, obliquity 23.44°), so the
 * sub-solar geographic longitude = RA - GMST ≈ -28.7°. Sub-solar latitude ≈ +20.5°
 * (late-July solar declination). Denmark at (10°E, 56°N) is ~39° of longitude east
 * of that meridian — well inside the 90° day hemisphere — so it MUST be lit.
 *
 * The Blue Marble asset (equirectangular, verified by inspecting earth-2048.jpg)
 * paints geographic longitude 0 at the image CENTRE (u=0.5), east increasing
 * left→right, south→north in v. So Denmark's texel is at
 * uv = (0.5 + 10/360, 56/180 + 0.5).
 *
 * ### What broke
 *
 * A texel's day/night is dot(its mesh local position, sunDirLocal). The sun
 * direction is astronomically correct (see the sub-solar guard below). The bug was
 * a 180° texture-registration error in cubeSphereMesh — the prime meridian mapped
 * to u=0 instead of the asset's centre u=0.5 — so Denmark's texel was drawn at
 * local longitude ~190° and fell on the night hemisphere. This test walks the
 * ACTUAL earth-surface mesh to find where Denmark's texel is drawn, so it fails on
 * the pre-fix registration and passes on the corrected one.
 */

const RAD = 180 / Math.PI;
// 2026-07-21T14:00:00Z as a UT-based Julian Date (JD starts at noon → the .5).
const JD_2026_07_21_1400Z = Date.UTC(2026, 6, 21, 14, 0, 0) / 86_400_000 + 2440587.5;

// Denmark's texel in the Blue Marble asset's equirectangular uv (see header).
const DENMARK_U = 0.5 + 10 / 360;
const DENMARK_V = 56 / 180 + 0.5;

// Walk the real earth-surface mesh (all six cube faces) and return the local-frame
// surface position (unit normal) of the vertex whose uv is nearest Denmark's texel.
// u is circular, so compare longitudes on the circle.
function denmarkLocalDir(): [number, number, number] {
  let best: [number, number, number] = [0, 0, 0];
  let bestD = Infinity;
  for (let face = 0; face < 6; face++) {
    const m = cubeSphereMesh(face, 0, 0, 0, 64);
    const vertexCount = m.uvs.length / 2;
    for (let i = 0; i < vertexCount; i++) {
      const u = m.uvs[i * 2] as number;
      const v = m.uvs[i * 2 + 1] as number;
      let du = Math.abs(((u - DENMARK_U) % 1) + 1) % 1;
      if (du > 0.5) du = 1 - du;
      const d = du * du + (v - DENMARK_V) ** 2;
      if (d < bestD) {
        bestD = d;
        best = [
          m.positions[i * 3] as number,
          m.positions[i * 3 + 1] as number,
          m.positions[i * 3 + 2] as number,
        ];
      }
    }
  }
  return best;
}

describe('earth terminator', () => {
  it('places the sub-solar point at the astronomically correct direction (W(t) guard)', () => {
    const earth = deriveBodyStates(JD_2026_07_21_1400Z).get('earth')!;
    const sun = sunDirLocal(earth.positionMpc, RENDER_ORIGIN_MPC, earth.orientation);
    // Sub-solar point in Earth's IAU body frame: longitude ≈ -28.7°, latitude
    // ≈ +20.5° (ground truth above). This has always been correct — it guards the
    // restored axial-rotation W(t) = W0 + Ẇ·d against a future sign/epoch slip.
    const subLon = Math.atan2(sun[1], sun[0]) * RAD;
    const subLat = Math.asin(sun[2]) * RAD;
    expect(subLon).toBeGreaterThan(-33);
    expect(subLon).toBeLessThan(-24);
    expect(subLat).toBeCloseTo(20.5, 0);
  });

  it('lights the Denmark texel (day/night not inverted against the live clock)', () => {
    const earth = deriveBodyStates(JD_2026_07_21_1400Z).get('earth')!;
    const sun = sunDirLocal(earth.positionMpc, RENDER_ORIGIN_MPC, earth.orientation);
    const dk = denmarkLocalDir();
    const lambert = dk[0] * sun[0] + dk[1] * sun[1] + dk[2] * sun[2];
    // > 0 ⇒ the painted Denmark faces the Sun (daylight). Pre-fix the texel sat at
    // local longitude ~190° and this was negative (night).
    expect(lambert).toBeGreaterThan(0);
  });
});
