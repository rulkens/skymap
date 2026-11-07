import type { StellarStreamMeta } from '../../../../src/layers/stellarStreams/catalog/@types/StellarStreamMeta';

export const SAGITTARIUS: StellarStreamMeta = {
  id: 'sagittarius',
  names: ['Sagittarius', 'Sagittarius stream'],
  description: 'The tidal debris of the Sagittarius dwarf galaxy.',
  source: 'vasiliev2021',
  reference: 'Vasiliev, Belokurov & Erkal 2021',
  lengthKpc: 274.6,
  distanceKpc: [6.4, 162.3],
  widthDeg: null,
  particleCount: 60000,
  colourT: 0.55,
  feh: null,
  fehRef: null,
  anchorMpc: [0.0056, -0.0225, -0.0137],
};

export const GD_1: StellarStreamMeta = {
  id: 'gd-1',
  names: ['GD-1'],
  description: 'GD-1, a stellar stream traced by the ibata2021 track of galstreams.',
  source: 'galstreams',
  reference: 'ibata2021',
  lengthKpc: 12.1,
  distanceKpc: [7.2, 10.1],
  widthDeg: 0.2,
  particleCount: 700,
  colourT: 0.2,
  feh: null,
  fehRef: null,
  anchorMpc: [-0.004, 0.006, 0.005],
};

export const SHORT: StellarStreamMeta = {
  ...GD_1,
  id: 'pal5',
  names: ['Pal 5'],
  lengthKpc: 4,
  feh: -1.41,
  fehRef: 'Harris 2010',
};

export const STREAM_META: readonly StellarStreamMeta[] = [SAGITTARIUS, GD_1, SHORT];
