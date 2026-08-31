/**
 * `EOX_REGIONS` — single source of truth for `fetch-eox --region` bboxes.
 * Keys are kebab-case and double as the harvest's subdirectory name under
 * `data/raw/eox/` (`<region>/<z>/<row>/<col>.jpg`) — widening a region means
 * editing an entry here, not passing a raw bbox on the command line.
 */

import type { EoxBbox } from './fetchEoxTiles';

export type EoxRegionName =
  | 'copenhagen'
  | 'amsterdam'
  | 'paris'
  | 'chicago'
  | 'sydney'
  | 'hong-kong'
  | 'new-york'
  | 'buenos-aires'
  | 'cape-town'
  | 'tokyo'
  | 'rio-de-janeiro'
  | 'grand-canyon'
  | 'great-barrier-reef'
  | 'bora-bora'
  | 'sossusvlei'
  | 'everest'
  | 'giza'
  | 'sjaelland';

export const EOX_REGIONS: Readonly<Record<EoxRegionName, EoxBbox>> = {
  copenhagen: { west: 12.2, south: 55.4, east: 13.05, north: 56.1 },
  amsterdam: { west: 4.5, south: 52.2, east: 5.1, north: 52.5 },
  paris: { west: 2.1, south: 48.7, east: 2.6, north: 49.0 },
  chicago: { west: -87.95, south: 41.6, east: -87.5, north: 42.05 },
  sydney: { west: 150.85, south: -34.1, east: 151.35, north: -33.7 },
  'hong-kong': { west: 113.85, south: 22.15, east: 114.4, north: 22.55 },
  'new-york': { west: -74.3, south: 40.5, east: -73.7, north: 40.95 },
  'buenos-aires': { west: -58.65, south: -34.75, east: -58.25, north: -34.45 },
  'cape-town': { west: 18.3, south: -34.4, east: 18.7, north: -33.8 },
  tokyo: { west: 139.6, south: 35.5, east: 140.0, north: 35.85 },
  'rio-de-janeiro': { west: -43.45, south: -23.1, east: -43.1, north: -22.8 },
  'grand-canyon': { west: -112.4, south: 35.95, east: -111.8, north: 36.35 },
  'great-barrier-reef': { west: 148.7, south: -20.4, east: 149.3, north: -19.9 },
  'bora-bora': { west: -151.85, south: -16.65, east: -151.55, north: -16.4 },
  sossusvlei: { west: 15.2, south: -24.9, east: 15.6, north: -24.5 },
  everest: { west: 86.7, south: 27.8, east: 87.1, north: 28.1 },
  giza: { west: 31.0, south: 29.85, east: 31.5, north: 30.15 },
  // East edge abuts copenhagen's west edge at the z13 tile column boundary
  // (col 8746 vs 8747) — no duplicate tiles between the two region dirs.
  sjaelland: { west: 10.85, south: 54.95, east: 12.18, north: 56.1 },
};
