/**
 * EARTH_PLACES — search-only points inside the Earth regions baked with
 * high-res EOX satellite imagery (bboxes: tools/fetch/eoxRegions.ts; src
 * can't import tools/, so the points are hand-picked here, not derived).
 * Each point is a landmark inside its bbox, never the bbox centre — several
 * centres fall in open water. `altKm` frames the place: ~8-15 km for a city,
 * ~2-5 km for a single landmark; Everest/Grand Canyon/Cape Town reuse the
 * hand-tuned values from `data/debug/flyToPresets.ts`.
 */
import type { EarthPlace } from '../../@types/palette/EarthPlace';

export const EARTH_PLACES: readonly EarthPlace[] = [
  { id: 'copenhagen', names: ['Copenhagen', 'København'], lonDeg: 12.5683, latDeg: 55.6761, altKm: 10 },
  { id: 'sondermarken', names: ['Søndermarken', 'Sondermarken'], lonDeg: 12.5233, latDeg: 55.6706, altKm: 1.5 },
  { id: 'amsterdam', names: ['Amsterdam'], lonDeg: 4.8936, latDeg: 52.3731, altKm: 10 },
  { id: 'paris', names: ['Paris', 'Eiffel Tower'], lonDeg: 2.2945, latDeg: 48.8584, altKm: 10 },
  { id: 'chicago', names: ['Chicago'], lonDeg: -87.6298, latDeg: 41.8781, altKm: 10 },
  { id: 'sydney', names: ['Sydney', 'Sydney Opera House'], lonDeg: 151.2153, latDeg: -33.8568, altKm: 10 },
  { id: 'hong-kong', names: ['Hong Kong', 'HK'], lonDeg: 114.1694, latDeg: 22.3193, altKm: 10 },
  { id: 'new-york', names: ['New York', 'NYC', 'Manhattan'], lonDeg: -73.9857, latDeg: 40.7484, altKm: 10 },
  { id: 'buenos-aires', names: ['Buenos Aires'], lonDeg: -58.3816, latDeg: -34.6037, altKm: 10 },
  { id: 'cape-town', names: ['Cape Town', 'Table Mountain'], lonDeg: 18.4033, latDeg: -33.9575, altKm: 4 },
  { id: 'tokyo', names: ['Tokyo', 'Tokyo Tower'], lonDeg: 139.7454, latDeg: 35.6586, altKm: 10 },
  {
    id: 'rio-de-janeiro',
    names: ['Rio de Janeiro', 'Rio', 'Christ the Redeemer'],
    lonDeg: -43.2105,
    latDeg: -22.9519,
    altKm: 5,
  },
  { id: 'grand-canyon', names: ['Grand Canyon'], lonDeg: -112.1085, latDeg: 36.0616, altKm: 5 },
  { id: 'great-barrier-reef', names: ['Great Barrier Reef'], lonDeg: 149.0, latDeg: -20.1, altKm: 5 },
  { id: 'bora-bora', names: ['Bora Bora', 'Mount Otemanu'], lonDeg: -151.7415, latDeg: -16.5004, altKm: 3 },
  { id: 'sossusvlei', names: ['Sossusvlei'], lonDeg: 15.3833, latDeg: -24.7333, altKm: 3 },
  {
    id: 'everest',
    names: ['Everest', 'Mount Everest', 'Chomolungma'],
    lonDeg: 86.925,
    latDeg: 27.9881,
    altKm: 12,
  },
  {
    id: 'giza',
    names: ['Giza', 'Pyramids of Giza', 'Great Pyramid'],
    lonDeg: 31.1342,
    latDeg: 29.9792,
    altKm: 3,
  },
];
