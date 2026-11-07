/**
 * Published stellar mass per stream in M☉, keyed by galstreams `Name`; copied from the primary
 * sources, never typed from memory. Most are the mass of the part a survey saw, not the whole
 * stream (DES streams run past its footprint). Ranges and limits are left out, which drops
 * Sagittarius, C-19 and Pal 5; Tucana III too, whose DES text and table disagree. The task-19
 * report in .superpowers/sdd/2026-11-06-stellar-streams/ quotes each value's source line.
 * The build fails on a key that names no built stream.
 */
import type { StreamStellarMass } from '../@types/StreamStellarMass';

// Shipp et al. 2018, ApJ 862, 114, "Derived parameters" table, column "Stellar Mass (10^3 M☉)".
const SHIPP = { ref: 'Shipp+ 2018', derived: false } as const;

export const STREAM_STELLAR_MASS: Readonly<Record<string, StreamStellarMass>> = {
  'AAU-ATLAS': { massMsun: 7.4e3, ...SHIPP },
  'AAU-AliqaUma': { massMsun: 2.3e3, ...SHIPP },
  Elqui: { massMsun: 10.4e3, ...SHIPP },
  Indus: { massMsun: 34.0e3, ...SHIPP },
  Jhelum: { massMsun: 13.0e3, ...SHIPP },
  Molonglo: { massMsun: 3.5e3, ...SHIPP },
  Phoenix: { massMsun: 2.8e3, ...SHIPP },
  Turranburra: { massMsun: 7.6e3, ...SHIPP },
  'Cetus-Palca': { massMsun: 1.4e6, ref: 'Thomas & Battaglia 2022', derived: false },
  'GD-1': { massMsun: 2e4, ref: 'Koposov+ 2010', derived: false },
  Jet: { massMsun: 2.5e4, ref: 'Jethwa+ 2018', derived: false },
  NGC5466: { massMsun: 4.0e3, ref: 'Jensen+ 2021', derived: false },
  Ophiuchus: { massMsun: 8.7e3, ref: 'Caldwell+ 2020', derived: false },
  'Orphan-Chenab': { massMsun: 5.6e5, ref: 'Koposov+ 2023', derived: false },
};
