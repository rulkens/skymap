import type { AsteroidClass } from '../../src/@types/asteroids/AsteroidClass';

/**
 * asteroidClassFromOrbitType — MPCORB's orbit type (low 6 bits of the flags column) to a Settings class:
 * 1–4 (Atira, Aten, Apollo, Amor) near-Earth, 8 Hilda, 9 Jupiter Trojan, 10 distant. Everything else
 * (0, 5 q < 1.665 AU, 6 Hungaria, 7 and undefined values) counts as the main belt.
 */
export function asteroidClassFromOrbitType(orbitType: number): AsteroidClass {
  if (orbitType >= 1 && orbitType <= 4) return 'nearEarth';
  if (orbitType === 8) return 'hilda';
  if (orbitType === 9) return 'jupiterTrojan';
  if (orbitType === 10) return 'distant';
  return 'mainBelt';
}
