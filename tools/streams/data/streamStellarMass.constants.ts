/**
 * Published stellar mass per stream in M☉, keyed by galstreams `Name`; copied from the primary
 * sources (arXiv LaTeX), never typed from memory. A mass measured over only part of a stream, a
 * published lower limit on its detected part included (NGC5466), is kept as `partial` and shows
 * as "≥". Values that rest on an assumed mass-to-light range stay out: C-19's "at least ~0.8×10⁴"
 * (Martin+ 2022, M/L 2–3). Sagittarius (only luminosity ranges), Pal 5 (only a ratio to the
 * cluster) and Tucana III (Shipp's text and table disagree) have none. The build fails on a key
 * that names no built stream.
 */
import type { StreamStellarMass } from '../@types/StreamStellarMass';

// arXiv 1801.03097 (Shipp et al. 2018, ApJ 862, 114), "Derived parameters" table, "Stellar Mass (10^3 M☉)".
const SHIPP = 'Shipp+ 2018';

export const STREAM_STELLAR_MASS: Readonly<Record<string, StreamStellarMass>> = {
  'AAU-ATLAS': { massMsun: 7.4e3, ref: SHIPP, partial: true }, // ~28° long, "22.6° ... within DES"
  'AAU-AliqaUma': { massMsun: 2.3e3, ref: SHIPP, partial: false },
  Elqui: { massMsun: 10.4e3, ref: SHIPP, partial: false },
  Indus: { massMsun: 34.0e3, ref: SHIPP, partial: true }, // "may extend beyond" DES; ≥ holds either way
  Jhelum: { massMsun: 13.0e3, ref: SHIPP, partial: true }, // "a longer portion" (than Indus) in DES
  Phoenix: { massMsun: 2.8e3, ref: SHIPP, partial: false },
  Turranburra: { massMsun: 7.6e3, ref: SHIPP, partial: true }, // at DES's edge; ≥ holds either way
  // arXiv 2112.03973 §"Tracing the Cetus-Palca stream ...", the median of 100 realisations.
  'Cetus-Palca': { massMsun: 1.4e6, ref: 'Thomas & Battaglia 2022', partial: false },
  // arXiv 0907.1085 §"Stellar population of the stream", stars at −60° < φ1 < −10° only.
  'GD-1': { massMsun: 2e4, ref: 'Koposov+ 2010', partial: true },
  // arXiv 1711.09103 §"The progenitor?", MSTO fit; the stream is "truncated by the survey footprint".
  Jet: { massMsun: 2.5e4, ref: 'Jethwa+ 2018', partial: true },
  // arXiv 2108.04340 §"Luminosity", the detected part, "only ... a lower limit".
  NGC5466: { massMsun: 4.0e3, ref: 'Jensen+ 2021', partial: true },
  // arXiv 2004.14350 §"Discussion and conclusions", "the entire stream".
  Ophiuchus: { massMsun: 8.7e3, ref: 'Caldwell+ 2020', partial: false },
  // arXiv 2211.04495 §"Stream density", "the visible part of the stream".
  'Orphan-Chenab': { massMsun: 5.6e5, ref: 'Koposov+ 2023', partial: true },
};
