import type { StellarStreamMeta } from '../../../../src/layers/stellarStreams/catalog/@types/StellarStreamMeta';

export const SAGITTARIUS: StellarStreamMeta = {
  id: 'sagittarius',
  names: ['Sagittarius', 'Sagittarius stream'],
  description: 'The tidal debris of the Sagittarius dwarf galaxy.',
  wikipediaTitle: 'Sagittarius Stream',
  source: 'vasiliev2021',
  reference: 'Vasiliev, Belokurov & Erkal 2021',
  lengthKpc: 274.6,
  frameRadiusKpc: 55.3,
  distanceKpc: [6.4, 162.3],
  widthDeg: null,
  particleCount: 60000,
  colourT: 0.55,
  focusBoost: 1,
  metallicity: null,
  stellarMass: null,
  anchorMpc: [0.0056, -0.0225, -0.0137],
  centrelineMpc: [
    [0.002, -0.03, -0.02],
    [0.0056, -0.0225, -0.0137],
    [0.01, -0.06, -0.04],
  ],
  ribbonWidthKpc: 5,
};

export const GD_1: StellarStreamMeta = {
  id: 'gd-1',
  names: ['GD-1'],
  description: null,
  wikipediaTitle: null,
  source: 'galstreams',
  reference: 'ibata2021',
  lengthKpc: 12.1,
  frameRadiusKpc: 6.05,
  distanceKpc: [7.2, 10.1],
  widthDeg: 0.2,
  particleCount: 700,
  colourT: 0.2,
  focusBoost: 3.5,
  metallicity: null,
  stellarMass: { massMsun: 2e4, ref: 'Koposov+ 2010', partial: true },
  anchorMpc: [-0.004, 0.006, 0.005],
  centrelineMpc: [
    [-0.006, 0.005, 0.004],
    [-0.004, 0.006, 0.005],
  ],
  ribbonWidthKpc: 0.04,
};

export const SHORT: StellarStreamMeta = {
  ...GD_1,
  id: 'pal5',
  names: ['Pal 5'],
  lengthKpc: 4,
  metallicity: { feh: -1.41, ref: 'Harris 1996, 2010 ed.' },
  stellarMass: null,
};

export const STREAM_META: readonly StellarStreamMeta[] = [SAGITTARIUS, GD_1, SHORT];
