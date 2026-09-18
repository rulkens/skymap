// Terrain test landmarks for the Surface Tiles fly-to row. Chosen to span the
// regimes that break height code in different ways — a gentle hill inside a
// deep band, extreme relief, a cliff edge whose ray grazes, land below the
// datum, and an island where the surrounding ocean floor is the miss case.
// Each `altKm` is roughly "the relief fills the view".

import type { FlyToPreset } from '../../@types/data/debug/FlyToPreset';
import { SURFACE_FIXED_SITES } from '../bodies/surfaceFixedSites';
import { findByIdOrThrow } from '../../utils/object/findByIdOrThrow';

const EARTH_PRESETS = [
  {
    label: 'Søndermarken',
    body: 'earth',
    lonDeg: 12.5233,
    latDeg: 55.6706,
    altKm: 1.5,
    title: 'Copenhagen, ~29 m — a low hill inside the deepest Danish band',
  },
  {
    label: 'Everest',
    body: 'earth',
    lonDeg: 86.925,
    latDeg: 27.9881,
    altKm: 12,
    title: 'Summit, ~8,849 m — the ceiling case for the camera floor',
  },
  {
    label: 'Grand Canyon',
    body: 'earth',
    lonDeg: -112.1085,
    latDeg: 36.0616,
    altKm: 5,
    title: 'Mather Point — ~1,500 m of relief within one tile',
  },
  {
    label: 'Table Mountain',
    body: 'earth',
    lonDeg: 18.4033,
    latDeg: -33.9575,
    altKm: 4,
    title: 'Cape Town — a near-vertical face, the grazing-incidence pick',
  },
  {
    label: 'Dead Sea',
    body: 'earth',
    lonDeg: 35.4936,
    latDeg: 31.559,
    altKm: 3,
    title: 'Shore, ~-430 m — the only land well BELOW the datum',
  },
  {
    label: 'Mauna Kea',
    body: 'earth',
    lonDeg: -155.4681,
    latDeg: 19.8207,
    altKm: 8,
    title: 'Summit, ~4,207 m — isolated relief ringed by ocean floor',
  },
] as const satisfies readonly FlyToPreset[];

/** High enough to hold a whole rover-site band in view, low enough to be
 *  inside it — the four Mars bands are baked z10-17 and ~0.05° across. */
const MARS_SITE_ALT_KM = 4;

/**
 * Read the degrees THROUGH the site table rather than copying them: Curiosity's
 * and Perseverance's rows are live end-of-drive fixes refreshed from the NASA
 * waypoint JSON, so a literal here would go on flying to where the rover used
 * to be, with nothing failing to say so. `findByIdOrThrow` turns a renamed site
 * id into a loud boot error instead of a button that silently does nothing.
 * (The table stores Opportunity's longitude as 354.619°E; east-positive degrees
 * go through `lonLatDegToDirection`'s trig unwrapped, so no normalisation.)
 */
function roverPreset(siteId: string, label: string, title: string): FlyToPreset {
  const site = findByIdOrThrow(SURFACE_FIXED_SITES, siteId, 'flyToPresets');
  return {
    label,
    body: 'mars',
    lonDeg: site.lonDeg,
    latDeg: site.latDeg,
    altKm: MARS_SITE_ALT_KM,
    title,
  };
}

const MARS_PRESETS: readonly FlyToPreset[] = [
  roverPreset('curiosity', 'Gale', "Curiosity's site — Aeolis Mons rises ~5 km out of it"),
  roverPreset('perseverance', 'Jezero', "Perseverance's site — a delta against the crater rim"),
  roverPreset('spirit', 'Gusev', "Spirit's site — Columbia Hills on an otherwise flat floor"),
  roverPreset('opportunity', 'Meridiani', "Opportunity's site — the low-relief case"),
];

export const FLY_TO_PRESETS: readonly FlyToPreset[] = [...EARTH_PRESETS, ...MARS_PRESETS];
