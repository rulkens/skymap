/**
 * ANTIQUE_FIGURE_ANCHORS — the stars each Hevelius figure (1690) lies on, read
 * off his star symbols on the source scans (PROVENANCE.md) before they were
 * inpainted. His plates are ecliptic, globe-view projections, so the sprite's up
 * and handedness are not the sky's: placement fits both from these each frame.
 * Hydra is anchored head to Crater only: its 100° body is drawn foreshortened,
 * so one rigid sprite on a pinhole sky cannot also hold the bend and tail.
 */

import type { AntiqueFigureAnchor } from '../../@types/rendering/AntiqueFigureAnchor';

export const ANTIQUE_FIGURE_ANCHORS: Readonly<Record<string, readonly AntiqueFigureAnchor[]>> = {
  cetus: [
    { star: 'Diphda', raDeg: 10.9, decDeg: -17.99, u: 0.21, v: 0.5101 },
    { star: 'ι Cet', raDeg: 4.86, decDeg: -8.82, u: 0.1556, v: 0.2379 },
    { star: 'η Cet', raDeg: 17.15, decDeg: -10.18, u: 0.3523, v: 0.3957 },
    { star: 'θ Cet', raDeg: 21.01, decDeg: -8.18, u: 0.4277, v: 0.387 },
    { star: 'τ Cet', raDeg: 26.02, decDeg: -15.94, u: 0.4579, v: 0.6167 },
    { star: 'ζ Cet', raDeg: 27.87, decDeg: -10.34, u: 0.5182, v: 0.4954 },
    { star: 'Mira', raDeg: 34.84, decDeg: -2.98, u: 0.6704, v: 0.387 },
    { star: 'δ Cet', raDeg: 39.87, decDeg: 0.33, u: 0.7871, v: 0.3498 },
    { star: 'γ Cet', raDeg: 40.83, decDeg: 3.24, u: 0.8278, v: 0.2847 },
    { star: 'Menkar', raDeg: 45.57, decDeg: 4.09, u: 0.9117, v: 0.2986 },
    { star: 'λ Cet', raDeg: 44.93, decDeg: 8.91, u: 0.9406, v: 0.179 },
    { star: 'μ Cet', raDeg: 41.24, decDeg: 10.11, u: 0.8881, v: 0.153 },
  ],
  dragon: [
    { star: 'Eltanin', raDeg: 269.15, decDeg: 51.49, u: 0.4181, v: 0.0189 },
    { star: 'Rastaban', raDeg: 262.61, decDeg: 52.3, u: 0.5225, v: 0.0435 },
    { star: 'ν Dra', raDeg: 263.05, decDeg: 55.18, u: 0.5025, v: 0.1016 },
    { star: 'ξ Dra', raDeg: 268.38, decDeg: 56.87, u: 0.4181, v: 0.1238 },
    { star: 'μ Dra', raDeg: 256.33, decDeg: 54.47, u: 0.6091, v: 0.105 },
    { star: 'θ Dra', raDeg: 240.47, decDeg: 58.57, u: 0.7752, v: 0.2478 },
    { star: 'η Dra', raDeg: 245.99, decDeg: 61.51, u: 0.6748, v: 0.2741 },
    { star: 'ζ Dra', raDeg: 257.2, decDeg: 65.71, u: 0.514, v: 0.3199 },
    { star: 'ι Dra', raDeg: 231.23, decDeg: 58.97, u: 0.8765, v: 0.3062 },
    { star: 'δ Dra', raDeg: 288.14, decDeg: 67.66, u: 0.204, v: 0.3547 },
    { star: 'φ Dra', raDeg: 275.19, decDeg: 71.34, u: 0.3377, v: 0.4118 },
    { star: 'ψ Dra', raDeg: 265.48, decDeg: 72.15, u: 0.403, v: 0.434 },
    { star: 'Thuban', raDeg: 211.1, decDeg: 64.38, u: 0.9355, v: 0.5259 },
    { star: 'κ Dra', raDeg: 188.37, decDeg: 69.79, u: 0.8747, v: 0.7308 },
    { star: 'λ Dra', raDeg: 172.85, decDeg: 69.33, u: 0.8898, v: 0.8419 },
  ],
  seaSerpent: [
    { star: 'Alphard', raDeg: 141.9, decDeg: -8.66, u: 0.2443, v: 0.5175 },
    { star: 'δ Hya', raDeg: 129.41, decDeg: 5.7, u: 0.0521, v: 0.1498 },
    { star: 'ε Hya', raDeg: 131.69, decDeg: 6.42, u: 0.0696, v: 0.0982 },
    { star: 'ρ Hya', raDeg: 132.11, decDeg: 5.84, u: 0.0768, v: 0.1221 },
    { star: 'ζ Hya', raDeg: 133.85, decDeg: 5.95, u: 0.0932, v: 0.0952 },
    { star: 'σ Hya', raDeg: 129.69, decDeg: 3.34, u: 0.0707, v: 0.2297 },
    { star: 'η Hya', raDeg: 130.81, decDeg: 3.4, u: 0.0804, v: 0.2125 },
    { star: 'λ Hya', raDeg: 152.65, decDeg: -12.35, u: 0.3577, v: 0.501 },
    { star: 'μ Hya', raDeg: 156.52, decDeg: -16.84, u: 0.4104, v: 0.6049 },
    { star: 'ν Hya', raDeg: 162.41, decDeg: -16.19, u: 0.4608, v: 0.4965 },
    { star: 'υ¹ Hya', raDeg: 147.87, decDeg: -14.85, u: 0.3273, v: 0.652 },
  ],
};
