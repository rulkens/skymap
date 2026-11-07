/**
 * Measured [Fe/H] per stream, keyed by galstreams `Name`; copied from the primary sources, never
 * typed from memory. Globular-cluster streams named for their cluster take the cluster's value from
 * Harris 1996 (2010 edition), `mwgc.dat` Part II, https://physics.mcmaster.ca/~harris/mwgc.dat.
 * Streams in S5 take the mean CaT [Fe/H] of Li et al. 2022, ApJ 928, 30, Table 1
 * (https://arxiv.org/abs/2110.06950); S5's one AAU and one Jhelum value cover their galstreams
 * components. Streams missing here take the table's median (`streamMetallicity`).
 */
import type { StreamMetallicity } from '../@types/StreamMetallicity';

const HARRIS = 'Harris 2010';
const S5 = 'Li et al. 2022';

export const STREAM_METALLICITY: Readonly<Record<string, StreamMetallicity>> = {
  M2: { feh: -1.65, ref: HARRIS }, // NGC 7089
  'M3-Svol': { feh: -1.5, ref: HARRIS }, // NGC 5272
  M30: { feh: -2.27, ref: HARRIS }, // NGC 7099
  M5: { feh: -1.29, ref: HARRIS }, // NGC 5904
  M68: { feh: -2.23, ref: HARRIS }, // NGC 4590
  'M68-Fjorm': { feh: -2.23, ref: HARRIS },
  M92: { feh: -2.31, ref: HARRIS }, // NGC 6341
  NGC1261: { feh: -1.27, ref: HARRIS },
  NGC1851: { feh: -1.18, ref: HARRIS },
  NGC2298: { feh: -1.92, ref: HARRIS },
  NGC2808: { feh: -1.14, ref: HARRIS },
  NGC288: { feh: -1.32, ref: HARRIS },
  NGC3201: { feh: -1.59, ref: HARRIS },
  'NGC3201-Gjoll': { feh: -1.59, ref: HARRIS },
  NGC5466: { feh: -1.98, ref: HARRIS },
  NGC6101: { feh: -1.98, ref: HARRIS },
  NGC6362: { feh: -0.99, ref: HARRIS },
  NGC6397: { feh: -2.02, ref: HARRIS },
  'OmegaCen-Fimbulthul': { feh: -1.53, ref: HARRIS }, // NGC 5139
  Pal15: { feh: -2.07, ref: HARRIS },
  Pal5: { feh: -1.41, ref: HARRIS },
  '300S': { feh: -1.26, ref: S5 },
  Ophiuchus: { feh: -1.8, ref: S5 },
  'AAU-AliqaUma': { feh: -2.22, ref: S5 },
  'AAU-ATLAS': { feh: -2.22, ref: S5 },
  Jet: { feh: -2.38, ref: S5 },
  Phoenix: { feh: -2.62, ref: S5 },
  // S5 measures Orphan (−1.85, 49 giants) and Chenab (−1.78, 109) apart: their giant-weighted mean.
  'Orphan-Chenab': { feh: -1.8, ref: S5 },
  Jhelum: { feh: -1.83, ref: S5 },
  'Jhelum-a': { feh: -1.83, ref: S5 },
  'Jhelum-b': { feh: -1.83, ref: S5 },
  Indus: { feh: -1.96, ref: S5 },
  Elqui: { feh: -2.22, ref: S5 },
  Turranburra: { feh: -2.18, ref: S5 },
};
