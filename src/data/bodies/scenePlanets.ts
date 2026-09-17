/**
 * scenePlanets — planet + moon seeds at their real J2000 mean positions, DERIVED
 * from `ORBITAL_ELEMENTS` via `keplerianPositionMpc`, so a body sits exactly on the
 * ellipse its trail draws. `datumRadiusM` is authored in SI metres and resolved
 * into a draw-space sphere at render time. Albedos are plausible
 * flat linear-RGB colours, inline rather than in `palette.ts` because each is
 * per-body data read once at its seed site.
 */

import { heliocentricPlanet } from './makers/heliocentricPlanet';
import { MARS_AREOID_RELIEF_M, MARS_IAU_SPHERE_RADIUS_M } from './marsSurfaceParams';
import { satelliteBody } from './makers/satelliteBody';
import type { PlanetBody } from '../../@types/scene/PlanetBody';

const MARS_DATUM_RADIUS_M = 3390000;
/** Areoid heights rebased onto the datum, the same shift the terrain bake adds. */
const MARS_DATUM_OFFSET_M = MARS_IAU_SPHERE_RADIUS_M - MARS_DATUM_RADIUS_M;

export const SCENE_PLANETS: readonly PlanetBody[] = [
  heliocentricPlanet({
    id: 'mercury',
    label: 'Mercury',
    datumRadiusM: 2440000,
    albedo: [0.3, 0.29, 0.27],
  }),
  heliocentricPlanet({
    id: 'venus',
    label: 'Venus',
    datumRadiusM: 6052000,
    albedo: [0.85, 0.8, 0.6],
  }),
  heliocentricPlanet({
    id: 'mars',
    label: 'Mars',
    datumRadiusM: MARS_DATUM_RADIUS_M,
    albedo: [0.6, 0.32, 0.23],
    reliefM: [
      MARS_AREOID_RELIEF_M[0] + MARS_DATUM_OFFSET_M,
      MARS_AREOID_RELIEF_M[1] + MARS_DATUM_OFFSET_M,
    ],
  }),
  heliocentricPlanet({
    id: 'jupiter',
    label: 'Jupiter',
    datumRadiusM: 69911000,
    albedo: [0.8, 0.65, 0.45],
  }),
  heliocentricPlanet({
    id: 'saturn',
    label: 'Saturn',
    datumRadiusM: 58232000,
    albedo: [0.8, 0.7, 0.5],
  }),
  heliocentricPlanet({
    id: 'uranus',
    label: 'Uranus',
    datumRadiusM: 25362000,
    albedo: [0.6, 0.8, 0.82],
  }),
  heliocentricPlanet({
    id: 'neptune',
    label: 'Neptune',
    datumRadiusM: 24622000,
    albedo: [0.3, 0.42, 0.75],
  }),
  satelliteBody({ id: 'moon', label: 'Moon', datumRadiusM: 1737000, albedo: [0.35, 0.34, 0.33] }),
  satelliteBody({ id: 'phobos', label: 'Phobos', datumRadiusM: 11000, albedo: [0.3, 0.29, 0.28] }),
  satelliteBody({ id: 'deimos', label: 'Deimos', datumRadiusM: 6000, albedo: [0.32, 0.3, 0.28] }),
  satelliteBody({ id: 'io', label: 'Io', datumRadiusM: 1822000, albedo: [0.6, 0.55, 0.32] }),
  satelliteBody({
    id: 'europa',
    label: 'Europa',
    datumRadiusM: 1561000,
    albedo: [0.75, 0.75, 0.72],
  }),
  satelliteBody({
    id: 'ganymede',
    label: 'Ganymede',
    datumRadiusM: 2634000,
    albedo: [0.55, 0.52, 0.48],
  }),
  satelliteBody({
    id: 'callisto',
    label: 'Callisto',
    datumRadiusM: 2410000,
    albedo: [0.4, 0.38, 0.35],
  }),
  satelliteBody({ id: 'mimas', label: 'Mimas', datumRadiusM: 198000, albedo: [0.72, 0.73, 0.73] }),
  satelliteBody({
    id: 'enceladus',
    label: 'Enceladus',
    datumRadiusM: 252000,
    albedo: [0.92, 0.92, 0.92],
  }),
  satelliteBody({
    id: 'tethys',
    label: 'Tethys',
    datumRadiusM: 531000,
    albedo: [0.76, 0.77, 0.77],
  }),
  satelliteBody({ id: 'dione', label: 'Dione', datumRadiusM: 561000, albedo: [0.72, 0.72, 0.72] }),
  satelliteBody({ id: 'rhea', label: 'Rhea', datumRadiusM: 764000, albedo: [0.7, 0.71, 0.71] }),
  satelliteBody({ id: 'titan', label: 'Titan', datumRadiusM: 2575000, albedo: [0.8, 0.6, 0.35] }),
  satelliteBody({
    id: 'iapetus',
    label: 'Iapetus',
    datumRadiusM: 735000,
    albedo: [0.4, 0.37, 0.32],
  }),
  // Appended after Iapetus rather than filed with the other heliocentric bodies:
  // SCENE_PLANETS is append-only, because a pick decodes to a body by array
  // position (see `bodySelectionRow.ts`'s `resolvePick`).
  heliocentricPlanet({
    id: 'pluto',
    label: 'Pluto',
    datumRadiusM: 1188300, // WGCCRE 2015 (Archinal+18), from New Horizons (Nimmo+17).
    albedo: [0.55, 0.5, 0.42],
  }),
  satelliteBody({
    id: 'charon',
    label: 'Charon',
    datumRadiusM: 606000, // WGCCRE 2015 (Archinal+18), superseding the 2009 report's 605 km.
    albedo: [0.4, 0.39, 0.38],
  }),
];
