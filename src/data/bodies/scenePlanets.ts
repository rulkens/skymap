/**
 * scenePlanets — planet + moon seeds at their real J2000 mean positions,
 * DERIVED from `ORBITAL_ELEMENTS` via `keplerianPositionMpc` — no hand-placed
 * literals.
 *
 * The seven non-Earth major planets are heliocentric (`heliocentricPlanet`);
 * the Moon and the planets' major moons are geocentric (`satelliteBody`),
 * riding their parent by construction. Each body sits exactly on the ellipse
 * its trail draws, both reading the one element table.
 *
 * `radiusKm` stays in kilometres — the body's native unit — and is resolved into
 * a draw-space sphere at render time, so the authored number remains the one a
 * reader recognises (Jupiter's 69911 km, the Moon's 1737 km). Albedos are
 * plausible flat linear-RGB colours (no textures yet); they stay INLINE because
 * each is per-body data read once at its seed site, not a shared palette.
 */

import { heliocentricPlanet } from './makers/heliocentricPlanet';
import { satelliteBody } from './makers/satelliteBody';
import type { PlanetBody } from '../../@types/scene/PlanetBody';

export const SCENE_PLANETS: readonly PlanetBody[] = [
  heliocentricPlanet({
    id: 'mercury',
    label: 'Mercury',
    radiusKm: 2440,
    albedo: [0.3, 0.29, 0.27],
  }),
  heliocentricPlanet({ id: 'venus', label: 'Venus', radiusKm: 6052, albedo: [0.85, 0.8, 0.6] }),
  heliocentricPlanet({ id: 'mars', label: 'Mars', radiusKm: 3390, albedo: [0.6, 0.32, 0.23] }),
  heliocentricPlanet({
    id: 'jupiter',
    label: 'Jupiter',
    radiusKm: 69911,
    albedo: [0.8, 0.65, 0.45],
  }),
  heliocentricPlanet({ id: 'saturn', label: 'Saturn', radiusKm: 58232, albedo: [0.8, 0.7, 0.5] }),
  heliocentricPlanet({ id: 'uranus', label: 'Uranus', radiusKm: 25362, albedo: [0.6, 0.8, 0.82] }),
  heliocentricPlanet({
    id: 'neptune',
    label: 'Neptune',
    radiusKm: 24622,
    albedo: [0.3, 0.42, 0.75],
  }),
  satelliteBody({ id: 'moon', label: 'Moon', radiusKm: 1737, albedo: [0.35, 0.34, 0.33] }),
  satelliteBody({ id: 'phobos', label: 'Phobos', radiusKm: 11, albedo: [0.3, 0.29, 0.28] }),
  satelliteBody({ id: 'deimos', label: 'Deimos', radiusKm: 6, albedo: [0.32, 0.3, 0.28] }),
  satelliteBody({ id: 'io', label: 'Io', radiusKm: 1822, albedo: [0.6, 0.55, 0.32] }),
  satelliteBody({ id: 'europa', label: 'Europa', radiusKm: 1561, albedo: [0.75, 0.75, 0.72] }),
  satelliteBody({ id: 'ganymede', label: 'Ganymede', radiusKm: 2634, albedo: [0.55, 0.52, 0.48] }),
  satelliteBody({ id: 'callisto', label: 'Callisto', radiusKm: 2410, albedo: [0.4, 0.38, 0.35] }),
  satelliteBody({ id: 'mimas', label: 'Mimas', radiusKm: 198, albedo: [0.72, 0.73, 0.73] }),
  satelliteBody({ id: 'enceladus', label: 'Enceladus', radiusKm: 252, albedo: [0.92, 0.92, 0.92] }),
  satelliteBody({ id: 'tethys', label: 'Tethys', radiusKm: 531, albedo: [0.76, 0.77, 0.77] }),
  satelliteBody({ id: 'dione', label: 'Dione', radiusKm: 561, albedo: [0.72, 0.72, 0.72] }),
  satelliteBody({ id: 'rhea', label: 'Rhea', radiusKm: 764, albedo: [0.7, 0.71, 0.71] }),
  satelliteBody({ id: 'titan', label: 'Titan', radiusKm: 2575, albedo: [0.8, 0.6, 0.35] }),
  satelliteBody({ id: 'iapetus', label: 'Iapetus', radiusKm: 735, albedo: [0.4, 0.37, 0.32] }),
  // Appended after Iapetus, not narratively with the other heliocentric
  // planets — SCENE_PLANETS order is append-only (pick indices are array
  // position; see the plan's Global constraints).
  heliocentricPlanet({
    id: 'pluto',
    label: 'Pluto',
    radiusKm: 1188.3, // WGCCRE 2015 (Archinal+18), from New Horizons (Nimmo+17).
    albedo: [0.55, 0.5, 0.42],
  }),
  // Appended after Pluto — same append-only pick-index constraint as Pluto's
  // own comment above.
  satelliteBody({
    id: 'charon',
    label: 'Charon',
    radiusKm: 606, // WGCCRE 2015 (Archinal+18), superseding the 2009 report's 605 km.
    albedo: [0.4, 0.39, 0.38],
  }),
];
