/**
 * Per-source classification + Milliquas parent-survey lookup helpers.
 *
 * Two slots on every `GalaxyCatalog` record carry per-row metadata
 * whose meaning depends on the source:
 *
 *   - `classByte` (uint8) — source-interpreted classification.
 *     Today only Milliquas populates it (AGN class letter →
 *     enum 1..6).  Every other source stores 0 and
 *     `sourceClassLabel` returns null.  Future per-galaxy-catalog class
 *     signals (e.g. GLADE morphology) add a new branch here
 *     without touching the .bin format.
 *
 *   - `parentSurveyByte` (uint8) — Milliquas-only enum that
 *     records which parent survey the row's Milliquas Name came
 *     from (SDSS/2MASX/GAIA/WISEA/NVSS/FIRST/6dFGS).  Used by the
 *     InfoCard to reconstruct the historical "<PARENT> J<RA><Dec>"
 *     display name from the bin without a sidecar JSON.
 *
 * Why a separate module rather than members on `sources.ts`?
 * `sources.ts` is the canonical "what's a galaxy catalog?" file and is
 * imported almost everywhere; growing it with per-row interpretation
 * tables would blur the boundary between "galaxy catalog identity" and "row
 * payload semantics".  Splitting them lets each module say one thing
 * cleanly.
 *
 * The byte values below are persisted in `.bin` files (see
 * `galaxyCatalogFormat.ts`).  Treat them like the `Source` enum
 * values — append, never renumber.
 */

import { Source } from './sources';
import type { SourceType } from '../@types/data/SourceType';

/**
 * Milliquas AGN class enum.  Letters Q/A/B/K/N/S come from the
 * Milliquas v8 Type column's leading non-space character; we map
 * each to a small contiguous integer that fits in a byte.  `0` is
 * reserved for "unknown / unclassified", which is the value every
 * non-Milliquas source writes.
 */
export const MILLIQUAS_CLASS_BYTE = {
  Q: 1,
  A: 2,
  B: 3,
  K: 4,
  N: 5,
  S: 6,
} as const;

/**
 * Milliquas parent-survey enum.  Each value corresponds to a prefix
 * that overwhelmingly appears at the start of the Milliquas Name
 * column (e.g. `"SDSS J012345.67+891234.5"`).  `0` is the catch-all
 * for literature designations (`3C 273`, `M 87`, `NGC 1275`) and any
 * unrecognised prefix.
 *
 * Naming: TWOMASX / SIXDFGS spell out the digit-prefix names that
 * would be invalid TypeScript identifiers otherwise.  The display
 * strings (`'2MASX'`, `'6dFGS'`) come from `PARENT_SURVEY_LABEL` below.
 */
export const MILLIQUAS_PARENT_SURVEY_BYTE = {
  SDSS: 1,
  TWOMASX: 2,
  GAIA: 3,
  WISEA: 4,
  NVSS: 5,
  FIRST: 6,
  SIXDFGS: 7,
} as const;

const MILLIQUAS_CLASS_LABEL: Record<number, string> = {
  [MILLIQUAS_CLASS_BYTE.Q]: 'Quasar',
  [MILLIQUAS_CLASS_BYTE.A]: 'AGN type-1',
  [MILLIQUAS_CLASS_BYTE.B]: 'BL Lac',
  [MILLIQUAS_CLASS_BYTE.K]: 'Seyfert-1 narrow',
  [MILLIQUAS_CLASS_BYTE.N]: 'Seyfert-1 broad',
  [MILLIQUAS_CLASS_BYTE.S]: 'Candidate',
};

const PARENT_SURVEY_LABEL: Record<number, string> = {
  [MILLIQUAS_PARENT_SURVEY_BYTE.SDSS]: 'SDSS',
  [MILLIQUAS_PARENT_SURVEY_BYTE.TWOMASX]: '2MASX',
  [MILLIQUAS_PARENT_SURVEY_BYTE.GAIA]: 'GAIA',
  [MILLIQUAS_PARENT_SURVEY_BYTE.WISEA]: 'WISEA',
  [MILLIQUAS_PARENT_SURVEY_BYTE.NVSS]: 'NVSS',
  [MILLIQUAS_PARENT_SURVEY_BYTE.FIRST]: 'FIRST',
  [MILLIQUAS_PARENT_SURVEY_BYTE.SIXDFGS]: '6dFGS',
};

/**
 * Human-readable label for this row's class byte, or null when the
 * source doesn't define one.  Used by the InfoCard's "AGN class"
 * row; non-Milliquas sources never display the row at all.
 */
export function sourceClassLabel(source: SourceType, classByte: number): string | null {
  if (source !== Source.Milliquas) return null;
  return MILLIQUAS_CLASS_LABEL[classByte] ?? null;
}

/**
 * Display prefix for a Milliquas parent-survey byte (`"SDSS"`,
 * `"2MASX"`, …), or null for the OTHER sentinel (byte 0) and any
 * unrecognised value.  The InfoCard prepends this to the
 * `iauRaDecSuffix(ra, dec)` to reconstruct the historical
 * `"<PARENT> J<RA><Dec>"` display name without a JSON sidecar.
 */
export function milliquasParentSurveyPrefix(byte: number): string | null {
  return PARENT_SURVEY_LABEL[byte] ?? null;
}
