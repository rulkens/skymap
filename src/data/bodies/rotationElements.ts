/**
 * rotationElements — J2000 rotation elements for bodies with a modelled facing:
 * pole (α₀, δ₀), prime meridian W₀ and spin rate Ẇ, all degrees. `orbitalElements`
 * places a body; this aims it. A body with no row is rotation-invariant and
 * falls back to `IDENTITY_MAT3`. Only Ẇ is live: the published pole rates
 * α̇/δ̇ and the periodic nutation/libration terms (Neptune's `N`, the Moon's `E1…`)
 * are dropped — they move the pole under an arcminute over 250
 * years, below a textured sphere's resolution. Source: the constant terms of
 * Archinal et al. (2018), Cel. Mech. Dyn. Astron. 130:22, Tables 1 and 2/3.
 */

import type { RotationElements } from '../../@types/scene/RotationElements';
import { MESH_BODY_PERIOD_DAYS } from './orbitalElements';

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
  {
    id: 'earth',
    poleRaDeg: 0.0,
    poleDecDeg: 90.0,
    primeMeridianDeg: 190.147,
    spinRateDegPerDay: 360.9856235,
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
  // Whale and petunias (Hitchhiker's Guide easter egg). The whale is ORBIT-LOCKED: one turn
  // per orbit about the orbit pole (Earth's own, so α₀/δ₀ match the 'earth' row), holding its
  // head along the velocity and its belly Earthward in the body frame the bake's
  // `bodyFromSource` remap sets (+X nose, -Y dorsal); W₀ phases that to the M = 0 epoch. The
  // pot's pole stays DECORATIVE — off-axis and quick, a turn per 90 s, so its tumble wobbles.
  {
    id: 'whale',
    poleRaDeg: 0.0,
    poleDecDeg: 90.0,
    primeMeridianDeg: 90.0,
    spinRateDegPerDay: 360 / MESH_BODY_PERIOD_DAYS,
  },
  {
    id: 'petunias',
    poleRaDeg: 198.6,
    poleDecDeg: -37.2,
    primeMeridianDeg: 0.0,
    spinRateDegPerDay: 345600,
  },
  // Both probes keep the high-gain dish on Earth — the real pointing constraint,
  // and the only one that stays true at any epoch as the geometry opens up.
  { kind: 'lookAt', id: 'voyager1', targetId: 'earth' },
  { kind: 'lookAt', id: 'voyager2', targetId: 'earth' },
  // Hubble holds an inertial attitude, but WHICH one is the observing schedule's
  // business, so this one is authored: aperture (+X) on the celestial north pole
  // — the one direction a 28.5°-inclined orbit never puts the Earth in front of
  // — and the solar-array long axis (+Z, the pole here) on the equinox. Ẇ = 0.
  {
    id: 'hubble',
    poleRaDeg: 0.0,
    poleDecDeg: 0.0,
    primeMeridianDeg: 90.0,
    spinRateDegPerDay: 0,
  },
  // Rover headings are AUTHORED presentation, not surveyed landing azimuths:
  // they only spread the four so no two face the same way, and the visual pass
  // is their only gate.
  { kind: 'surfaceLocked', id: 'curiosity', headingDeg: 90 },
  { kind: 'surfaceLocked', id: 'perseverance', headingDeg: 0 },
  { kind: 'surfaceLocked', id: 'spirit', headingDeg: 180 },
  { kind: 'surfaceLocked', id: 'opportunity', headingDeg: 270 },
  // The scan is already authored with +X east (no bodyFromSource remap), so
  // heading 90 puts body +X on east with no rotation left to apply.
  { kind: 'surfaceLocked', id: 'soendermarken', headingDeg: 90 },
];
