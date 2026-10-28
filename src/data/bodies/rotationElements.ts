/**
 * rotationElements — J2000 rotation elements for bodies with a modelled facing:
 * pole (α₀, δ₀), prime meridian W₀ and spin rate Ẇ, all degrees. `orbitalElements`
 * places a body; this aims it. A body with no row is rotation-invariant and
 * falls back to `IDENTITY_MAT3`. Ẇ is live everywhere; the pole rates α̇/δ̇ only
 * for Earth (0.15° by 2026, 17 km of ground), and the periodic nutation/libration
 * terms (Neptune's `N`, the Moon's `E1…`) nowhere — elsewhere they stay under an
 * arcminute over 250 years. Source: Archinal et al. (2018), Cel. Mech. Dyn.
 * Astron. 130:22, Tables 1 and 2/3; Earth's spin is the IERS one (see its row).
 */

import type { RotationElements } from '../../@types/scene/RotationElements';
import { LAYER_BODY_ROWS } from './layerBodyRows';

export function rotationRowById(id: string): RotationElements | null {
  return ROTATION_ELEMENTS.find((el) => el.id === id) ?? null;
}

export const ROTATION_ELEMENTS: readonly RotationElements[] = [
  {
    id: 'mercury',
    poleRaDeg: 281.0103,
    poleDecDeg: 61.4155,
    primeMeridianDeg: 329.5988,
    spinRateDegPerDay: 6.1385108,
  },
  // Retrograde, so Ẇ is negative under the planet convention — contrast Pluto below.
  {
    id: 'venus',
    poleRaDeg: 272.76,
    poleDecDeg: 67.16,
    primeMeridianDeg: 160.2,
    spinRateDegPerDay: -1.4813688,
  },
  // LANDMINE — Archinal's own Earth W (190.147 + 360.9856235·d) is in TDB days, and the
  // sim clock is UTC: fed UTC it put Greenwich 0.2–0.3° (23–35 km) west. W is instead the
  // IERS Earth Rotation Angle (UT1 ≈ UTC), ERA = 280.46061837504 + 360.98561228808761·d,
  // less 90° + α₀(t): `rotationFromIau` measures W from the node at α₀ + 90°, so the
  // −0.641°/cy α̇ adds 0.641/36525 °/day to Ẇ. The pole rates are the IAU precession.
  {
    id: 'earth',
    poleRaDeg: 0.0,
    poleDecDeg: 90.0,
    poleRaRateDegPerCty: -0.641,
    poleDecRateDegPerCty: -0.557,
    primeMeridianDeg: 190.46061837504,
    spinRateDegPerDay: 360.98562983768,
  },
  // `orbitPlaneFrames.ts` carries the same pole rounded to 317.681/52.887.
  {
    id: 'mars',
    poleRaDeg: 317.68143,
    poleDecDeg: 52.8865,
    primeMeridianDeg: 176.63,
    spinRateDegPerDay: 350.89198226,
  },
  {
    id: 'jupiter',
    poleRaDeg: 268.056595,
    poleDecDeg: 64.495303,
    primeMeridianDeg: 284.95,
    spinRateDegPerDay: 870.536,
  },
  // This pole MUST equal SATURN_EQUATORIAL_FRAME's (`orbitPlaneFrames.ts`) — texture and
  // rings ride one equatorial frame, and `rotationElements.test.ts` pins the two equal.
  {
    id: 'saturn',
    poleRaDeg: 40.589,
    poleDecDeg: 83.537,
    primeMeridianDeg: 38.9,
    spinRateDegPerDay: 810.7939024,
  },
  // Retrograde, and δ₀ is genuinely negative: the invariable-plane convention puts the
  // IAU north pole south of the ecliptic. Authored as published, not sign-flipped.
  {
    id: 'uranus',
    poleRaDeg: 257.311,
    poleDecDeg: -15.175,
    primeMeridianDeg: 203.81,
    spinRateDegPerDay: -501.1600928,
  },
  {
    id: 'neptune',
    poleRaDeg: 299.36,
    poleDecDeg: 43.46,
    primeMeridianDeg: 249.978,
    spinRateDegPerDay: 541.1397757,
  },
  {
    id: 'moon',
    poleRaDeg: 269.9949,
    poleDecDeg: 66.5392,
    primeMeridianDeg: 38.3213,
    spinRateDegPerDay: 13.17635815,
  },
  // Synchronous moons face their host by construction; see rotationTidallyLocked.
  // Phobos, Deimos and Titan are untextured, but a surface camera rides their frames:
  // row-less, the Sun would stand still in their skies.
  {
    kind: 'tidallyLocked',
    id: 'phobos',
    poleRaDeg: 317.68,
    poleDecDeg: 52.9,
  },
  {
    kind: 'tidallyLocked',
    id: 'deimos',
    poleRaDeg: 316.65,
    poleDecDeg: 53.52,
  },
  {
    kind: 'tidallyLocked',
    id: 'io',
    poleRaDeg: 268.05,
    poleDecDeg: 64.5,
  },
  {
    kind: 'tidallyLocked',
    id: 'europa',
    poleRaDeg: 268.08,
    poleDecDeg: 64.51,
  },
  {
    kind: 'tidallyLocked',
    id: 'ganymede',
    poleRaDeg: 268.2,
    poleDecDeg: 64.57,
  },
  {
    kind: 'tidallyLocked',
    id: 'callisto',
    poleRaDeg: 268.72,
    poleDecDeg: 64.83,
  },
  {
    kind: 'tidallyLocked',
    id: 'enceladus',
    poleRaDeg: 40.66,
    poleDecDeg: 83.52,
  },
  {
    kind: 'tidallyLocked',
    id: 'mimas',
    poleRaDeg: 40.66,
    poleDecDeg: 83.52,
  },
  {
    kind: 'tidallyLocked',
    id: 'tethys',
    poleRaDeg: 40.66,
    poleDecDeg: 83.52,
  },
  {
    kind: 'tidallyLocked',
    id: 'dione',
    poleRaDeg: 40.66,
    poleDecDeg: 83.52,
  },
  {
    kind: 'tidallyLocked',
    id: 'rhea',
    poleRaDeg: 40.38,
    poleDecDeg: 83.55,
  },
  {
    kind: 'tidallyLocked',
    id: 'titan',
    poleRaDeg: 39.4827,
    poleDecDeg: 83.4279,
  },
  {
    kind: 'tidallyLocked',
    id: 'iapetus',
    poleRaDeg: 318.16,
    poleDecDeg: 75.03,
  },
  {
    kind: 'tidallyLocked',
    id: 'miranda',
    poleRaDeg: 257.43,
    poleDecDeg: -15.08,
  },
  {
    kind: 'tidallyLocked',
    id: 'ariel',
    poleRaDeg: 257.43,
    poleDecDeg: -15.1,
  },
  {
    kind: 'tidallyLocked',
    id: 'umbriel',
    poleRaDeg: 257.43,
    poleDecDeg: -15.1,
  },
  {
    kind: 'tidallyLocked',
    id: 'titania',
    poleRaDeg: 257.43,
    poleDecDeg: -15.1,
  },
  {
    kind: 'tidallyLocked',
    id: 'oberon',
    poleRaDeg: 257.43,
    poleDecDeg: -15.1,
  },
  {
    kind: 'tidallyLocked',
    id: 'puck',
    poleRaDeg: 257.43,
    poleDecDeg: -15.1,
  },
  // Triton's IAU pole swings over 20 degrees (periods of ~680 yr), so a fixed IAU constant is wrong
  // at most dates. The pole is instead opposite the J2000 orbit normal Horizons gives (i 157.3,
  // node 176.77): RA 298.470, Dec 20.427, 0.13 degrees from the WGCCRE 2015 value. The drawn moon
  // follows Horizons, not the mean row (node 178.1, which would put the pole 0.5 degrees out).
  {
    kind: 'tidallyLocked',
    id: 'triton',
    poleRaDeg: 298.47,
    poleDecDeg: 20.427,
  },
  {
    kind: 'tidallyLocked',
    id: 'proteus',
    poleRaDeg: 299.27,
    poleDecDeg: 42.91,
  },
  // Pluto and Charon come from NAIF pck00011.tpc (BODY999/BODY901), not the tables above.
  // Minor-body pole convention: the "positive" pole, so Ẇ is positive despite the retrograde
  // spin — unlike Uranus/Venus above, which keep the planet convention and go negative.
  {
    id: 'pluto',
    poleRaDeg: 132.993,
    poleDecDeg: -6.163,
    primeMeridianDeg: 302.695,
    spinRateDegPerDay: 56.3625225,
  },
  // LANDMINE — what this row shares with Pluto's is physics, not copy-paste: mutual tidal lock
  // means one spin axis (identical pole), each prime meridian is the sub-companion one (W₀
  // exactly 180° apart), and rotation and orbit are one quantity measured twice (Ẇ =
  // 360°/6.387222 d, Charon's period in `orbitalElements.ts`; 56.3625225 × 6.387222 =
  // 359.99994°, the residual being their rounding).
  {
    id: 'charon',
    poleRaDeg: 132.993,
    poleDecDeg: -6.163,
    primeMeridianDeg: 122.695,
    spinRateDegPerDay: 56.3625225,
  },
  ...LAYER_BODY_ROWS.flatMap((row) => row.rotation ?? []),
];
