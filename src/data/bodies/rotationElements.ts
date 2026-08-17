/**
 * rotationElements — J2000 rotation elements for the fifteen textured bodies:
 * pole (α₀, δ₀), prime meridian W₀ and spin rate Ẇ, all degrees. `orbitalElements`
 * places a body; this aims it. An untextured body is rotation-invariant, carries no
 * row, and falls back to `IDENTITY_MAT3`. Only Ẇ is live: the published pole rates
 * α̇/δ̇ and the periodic nutation/libration terms (Neptune's `N`, the Moon's `E1…`,
 * the Galileans' `Jn`) are dropped — they move the pole under an arcminute over 250
 * years, below a textured sphere's resolution. Source: the constant terms of
 * Archinal et al. (2018), Cel. Mech. Dyn. Astron. 130:22, Tables 1 and 2/3.
 */

import { findByIdOrThrow } from '../../utils/object/findByIdOrThrow';
import type { RotationElements } from '../../@types/scene/RotationElements';

export function rotationById(id: string): RotationElements {
  return findByIdOrThrow(ROTATION_ELEMENTS, id, 'rotationElements');
}

export const ROTATION_ELEMENTS: readonly RotationElements[] = [
  { id: 'mercury', poleRaDeg: 281.0103, poleDecDeg: 61.4155, primeMeridianDeg: 329.5988, spinRateDegPerDay: 6.1385108 },
  // Retrograde, so Ẇ is negative under the planet convention — contrast Pluto below.
  { id: 'venus', poleRaDeg: 272.76, poleDecDeg: 67.16, primeMeridianDeg: 160.2, spinRateDegPerDay: -1.4813688 },
  { id: 'earth', poleRaDeg: 0.0, poleDecDeg: 90.0, primeMeridianDeg: 190.147, spinRateDegPerDay: 360.9856235 },
  // `orbitPlaneFrames.ts` carries the same pole rounded to 317.681/52.887.
  { id: 'mars', poleRaDeg: 317.68143, poleDecDeg: 52.8865, primeMeridianDeg: 176.63, spinRateDegPerDay: 350.89198226 },
  { id: 'jupiter', poleRaDeg: 268.056595, poleDecDeg: 64.495303, primeMeridianDeg: 284.95, spinRateDegPerDay: 870.536 },
  // This pole MUST equal SATURN_EQUATORIAL_FRAME's (`orbitPlaneFrames.ts`) — texture and
  // rings ride one equatorial frame, and `rotationElements.test.ts` pins the two equal.
  { id: 'saturn', poleRaDeg: 40.589, poleDecDeg: 83.537, primeMeridianDeg: 38.9, spinRateDegPerDay: 810.7939024 },
  // Retrograde, and δ₀ is genuinely negative: the invariable-plane convention puts the
  // IAU north pole south of the ecliptic. Authored as published, not sign-flipped.
  { id: 'uranus', poleRaDeg: 257.311, poleDecDeg: -15.175, primeMeridianDeg: 203.81, spinRateDegPerDay: -501.1600928 },
  { id: 'neptune', poleRaDeg: 299.36, poleDecDeg: 43.46, primeMeridianDeg: 249.978, spinRateDegPerDay: 541.1397757 },
  { id: 'moon', poleRaDeg: 269.9949, poleDecDeg: 66.5392, primeMeridianDeg: 38.3213, spinRateDegPerDay: 13.17635815 },
  { id: 'io', poleRaDeg: 268.05, poleDecDeg: 64.5, primeMeridianDeg: 200.39, spinRateDegPerDay: 203.4889538 },
  { id: 'europa', poleRaDeg: 268.08, poleDecDeg: 64.51, primeMeridianDeg: 36.022, spinRateDegPerDay: 101.3747235 },
  { id: 'ganymede', poleRaDeg: 268.2, poleDecDeg: 64.57, primeMeridianDeg: 44.064, spinRateDegPerDay: 50.3176081 },
  { id: 'callisto', poleRaDeg: 268.72, poleDecDeg: 64.83, primeMeridianDeg: 259.51, spinRateDegPerDay: 21.5710715 },
  // Pluto and Charon come from NAIF pck00011.tpc (BODY999/BODY901), not the tables above.
  // Minor-body pole convention: the "positive" pole, so Ẇ is positive despite the retrograde
  // spin — unlike Uranus/Venus above, which keep the planet convention and go negative.
  { id: 'pluto', poleRaDeg: 132.993, poleDecDeg: -6.163, primeMeridianDeg: 302.695, spinRateDegPerDay: 56.3625225 },
  // LANDMINE — what this row shares with Pluto's is physics, not copy-paste: mutual tidal lock
  // means one spin axis (identical pole), each prime meridian is the sub-companion one (W₀
  // exactly 180° apart), and rotation and orbit are one quantity measured twice (Ẇ =
  // 360°/6.387222 d, Charon's period in `orbitalElements.ts`; 56.3625225 × 6.387222 =
  // 359.99994°, the residual being their rounding).
  { id: 'charon', poleRaDeg: 132.993, poleDecDeg: -6.163, primeMeridianDeg: 122.695, spinRateDegPerDay: 56.3625225 },
];
