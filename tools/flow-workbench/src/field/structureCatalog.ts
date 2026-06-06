/**
 * STRUCTURE_CATALOG — the curated cosmic structures shown as orientation labels.
 *
 * Hand-picked landmarks of the local universe, with ICRS RA/Dec (deg) and a
 * physical distance (Mpc). These are the observational inputs; `structureWorld`
 * turns each into a world-cube position via the verified CF4++ box mapping, so
 * the label lands on the matching overdensity in the rendered field.
 *
 * The list (and these exact values) come from the spike, where the placement
 * was cross-match-verified against the density field: under the chosen mapping
 * every massive cluster sat on a δ>1 knot. The trailing '?' on Corona Borealis
 * marks a >300 Mpc structure where the HMC reconstruction is prior-dominated —
 * direction is trustworthy, exact distance less so.
 */
import type { CatalogStructure } from '../../@types/field/CatalogStructure';

export const STRUCTURE_CATALOG: readonly CatalogStructure[] = [
  { name: 'us (MW)', raDeg: 0, decDeg: 0, distMpc: 0 },
  { name: 'Virgo', raDeg: 187.7, decDeg: 12.39, distMpc: 16.5 },
  { name: 'Centaurus', raDeg: 192.2, decDeg: -41.31, distMpc: 45 },
  { name: 'Great Attractor', raDeg: 243.55, decDeg: -60.84, distMpc: 67 },
  { name: 'Laniakea', raDeg: 243.55, decDeg: -60.84, distMpc: 50 },
  { name: 'Hydra', raDeg: 159.18, decDeg: -27.53, distMpc: 50 },
  { name: 'Coma', raDeg: 194.95, decDeg: 27.98, distMpc: 99 },
  { name: 'Perseus', raDeg: 49.95, decDeg: 41.51, distMpc: 73 },
  { name: 'Hercules', raDeg: 241.3, decDeg: 17.75, distMpc: 160 },
  { name: 'Shapley', raDeg: 201.99, decDeg: -31.5, distMpc: 200 },
  { name: 'Pavo-Indus', raDeg: 310.4, decDeg: -48.6, distMpc: 205 },
  { name: 'Columba', raDeg: 84.7, decDeg: -48.2, distMpc: 217 },
  { name: 'Corona Borealis?', raDeg: 249.9, decDeg: 32.7, distMpc: 397 },
];
