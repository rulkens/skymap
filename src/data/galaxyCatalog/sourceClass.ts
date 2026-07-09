/**
 * Per-source classification + Milliquas parent-survey lookup helpers.
 *
 * Two slots on every `GalaxyCatalog` record carry per-row metadata
 * whose meaning depends on the source:
 *
 *   - `classByte` (uint8) — source-interpreted classification.
 *     Milliquas populates it with an AGN class letter (enum 1..6);
 *     DESI Deep populates it with the LSS tracer (BGS/LRG/ELG/QSO,
 *     enum 1..4 — see `DESI_TRACER_CLASS` below). Every other source
 *     stores 0 and `sourceClassLabel` returns null. Future
 *     per-galaxy-catalog class signals (e.g. GLADE morphology) add a
 *     new branch here without touching the .bin format.
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

import { Source } from '../sources';
import type { SourceType } from '../../@types/data/SourceType';

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

/**
 * DESI Deep tracer enum. The deep-cone LSS clustering catalogs mix four
 * disjoint target classes (BGS_BRIGHT/LRG/ELG_LOPnotqso/QSO) in one .bin;
 * this byte is how the InfoCard tells a reader which population a given
 * point belongs to. `0` stays reserved for "unclassified", matching the
 * Milliquas convention above.
 *
 * Deliberately spelled out here rather than importing the tools-side
 * `DesiTracer` string-union type: `src/` must not depend on `tools/`
 * (the browser bundle can't pull in Node-only parser code), so this is
 * the one place both `parseDesiClustering` (tools/) and the InfoCard
 * (src/) can share the byte↔tracer mapping without a reverse import.
 */
export const DESI_TRACER_CLASS: Record<'BGS' | 'LRG' | 'ELG' | 'QSO', number> = {
  BGS: 1,
  LRG: 2,
  ELG: 3,
  QSO: 4,
};

const DESI_TRACER_LABEL: Record<number, string> = {
  [DESI_TRACER_CLASS.BGS]: 'Bright Galaxy Sample (BGS)',
  [DESI_TRACER_CLASS.LRG]: 'Luminous Red Galaxy (LRG)',
  [DESI_TRACER_CLASS.ELG]: 'Emission-Line Galaxy (ELG)',
  [DESI_TRACER_CLASS.QSO]: 'Quasar (QSO)',
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
 * source doesn't define one.  Used by the InfoCard's "AGN class" /
 * "DESI tracer" row; sources with no class semantics never display
 * the row at all.
 */
export function sourceClassLabel(source: SourceType, classByte: number): string | null {
  if (source === Source.Milliquas) return MILLIQUAS_CLASS_LABEL[classByte] ?? null;
  // Both DESI patches (deep cone + dec-band wedge) stamp the same tracer
  // classByte, so they share the tracer-label lookup.
  if (source === Source.DesiDeep || source === Source.DesiWedge)
    return DESI_TRACER_LABEL[classByte] ?? null;
  return null;
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
