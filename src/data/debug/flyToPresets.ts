// Terrain test landmarks for the Surface Tiles fly-to row. Chosen to span the
// regimes that break height code in different ways — a gentle hill inside a
// deep band, extreme relief, a cliff edge whose ray grazes, land below the
// datum, and an island where the surrounding ocean floor is the miss case.
// Each `altKm` is roughly "the relief fills the view": low for a hill you
// have to be on top of to see, high for a range you need distance to read.

import type { FlyToPreset } from '../../@types/data/debug/FlyToPreset';

export const FLY_TO_PRESETS = [
  {
    label: 'Søndermarken',
    lonDeg: 12.5233,
    latDeg: 55.6706,
    altKm: 1.5,
    title: 'Copenhagen, ~29 m — a low hill inside the deepest Danish band',
  },
  {
    label: 'Everest',
    lonDeg: 86.925,
    latDeg: 27.9881,
    altKm: 12,
    title: 'Summit, ~8,849 m — the ceiling case for the camera floor',
  },
  {
    label: 'Grand Canyon',
    lonDeg: -112.1085,
    latDeg: 36.0616,
    altKm: 5,
    title: 'Mather Point — ~1,500 m of relief within one tile',
  },
  {
    label: 'Table Mountain',
    lonDeg: 18.4033,
    latDeg: -33.9575,
    altKm: 4,
    title: 'Cape Town — a near-vertical face, the grazing-incidence pick',
  },
  {
    label: 'Dead Sea',
    lonDeg: 35.4936,
    latDeg: 31.559,
    altKm: 3,
    title: 'Shore, ~-430 m — the only land well BELOW the datum',
  },
  {
    label: 'Mauna Kea',
    lonDeg: -155.4681,
    latDeg: 19.8207,
    altKm: 8,
    title: 'Summit, ~4,207 m — isolated relief ringed by ocean floor',
  },
] as const satisfies readonly FlyToPreset[];
