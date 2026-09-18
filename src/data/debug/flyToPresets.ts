// Terrain test landmarks for the Surface Tiles fly-to row. Chosen to span the
// regimes that break height code in different ways — a gentle hill inside a
// deep band, extreme relief, a cliff edge whose ray grazes, land below the
// datum, and an island where the surrounding ocean floor is the miss case.
// Each `altKm` is roughly "the relief fills the view": low for a hill you
// have to be on top of to see, high for a range you need distance to read.
// The Mars rows are the four rover sites, each verified inside its own baked
// z10-17 band — the only Mars ground with tiles of its own.

import type { FlyToPreset } from '../../@types/data/debug/FlyToPreset';

export const FLY_TO_PRESETS = [
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
  {
    label: 'Gale',
    body: 'mars',
    lonDeg: 137.38848,
    latDeg: -4.8246,
    altKm: 4,
    title: "Curiosity's site — Aeolis Mons rises ~5 km out of the crater floor",
  },
  {
    label: 'Jezero',
    body: 'mars',
    lonDeg: 77.23205,
    latDeg: 18.43687,
    altKm: 4,
    title: "Perseverance's site — a delta against the crater rim",
  },
  {
    label: 'Gusev',
    body: 'mars',
    lonDeg: 175.52576,
    latDeg: -14.60036,
    altKm: 4,
    title: "Spirit's site — Columbia Hills on an otherwise flat floor",
  },
  {
    label: 'Meridiani',
    body: 'mars',
    lonDeg: -5.381,
    latDeg: -2.336,
    altKm: 4,
    title: "Opportunity's site — the flattest Mars band, the low-relief case",
  },
] as const satisfies readonly FlyToPreset[];
