/**
 * Milliquas v8 (Million Quasars) parser — Flesch 2023, the compilation
 * AGN catalogue distributed as a single 188-character fixed-width text
 * file at <https://quasars.org/milliquas.htm>.
 *
 * The parser emits a `ParsedRecord[]` whose per-record `classByte` and
 * `parentSurveyByte` fields carry every InfoCard-visible Milliquas
 * datum (AGN class letter + parent-survey prefix).  Both fields are
 * persisted by the v5 .bin format, so the runtime reconstructs the
 * historical `"<PARENT> J<RA><Dec>"` display name purely from the
 * binary — no companion JSON sidecar required.
 *
 * ---
 * ### Skip rules (spec-z subset only)
 *
 * Drop rows whose Z column is blank, non-positive (`0.000` or a bad
 * negative measurement), rounded to `.X00` (generic photo-z candidate),
 * or rounded to `.XY0` with Zcite=GAIA3 (Gaia DR3 QSOC photo-z).  See the
 * per-rule comments below for the long form.
 *
 * ---
 * ### Why bytes, not strings
 *
 * The .bin format carries the class letter as a per-record enum byte
 * (`classByte`) and the parent-survey prefix as a second per-record
 * enum byte (`parentSurveyByte`); see `src/data/sourceClass.ts` for
 * the lookup tables and `src/data/galaxyCatalogFormat.ts` for the
 * on-disk layout.  A small minority of Milliquas Names are
 * literature designations (`3C 273`, `M 87`); those map to
 * `parentSurveyByte = 0` and the runtime falls back to the generic
 * `MQ J<RA><Dec>` IAU name.
 */

import { Source } from '../../src/data/sources';
import {
  MILLIQUAS_CLASS_BYTE,
  MILLIQUAS_PARENT_SURVEY_BYTE,
} from '../../src/data/galaxyCatalog/sourceClass';
import { isPlausibleMagnitude } from '../utils/math/isPlausibleMagnitude';
import { nonCommentLines, type ParsedRecord } from './common';

// ─── Byte ranges (1-based inclusive, as published in the upstream ReadMe) ──

const RA_BYTES = [1, 11] as const;
const DEC_BYTES = [13, 23] as const;
const NAME_BYTES = [26, 50] as const;
const TYPE_BYTES = [52, 55] as const;
const RMAG_BYTES = [57, 61] as const;
const BMAG_BYTES = [63, 67] as const;
const Z_BYTES = [77, 82] as const;
const ZCITE_BYTES = [91, 96] as const;

const MIN_LINE_LEN = 188;
const ZCITE_GAIA_QSOC = 'GAIA3';
const PHOTO_Z_ROUNDED_TO_TENTH = /\.\d00\s*$/;
const PHOTO_Z_ROUNDED_TO_HUNDREDTH = /\.\d\d0\s*$/;

/**
 * Parent-survey prefixes we recognise in the Milliquas Name column.
 * Listed longest-first so the regex below can't match `2MASX` as a
 * prefix of `2MASS` (none of these is a prefix of any other, but
 * keeping the order intentional makes the regex review easier).
 */
const PARENT_PREFIX_BY_NAME: ReadonlyArray<readonly [string, number]> = [
  ['6dFGS', MILLIQUAS_PARENT_SURVEY_BYTE.SIXDFGS],
  ['WISEA', MILLIQUAS_PARENT_SURVEY_BYTE.WISEA],
  ['FIRST', MILLIQUAS_PARENT_SURVEY_BYTE.FIRST],
  ['2MASX', MILLIQUAS_PARENT_SURVEY_BYTE.TWOMASX],
  ['SDSS', MILLIQUAS_PARENT_SURVEY_BYTE.SDSS],
  ['GAIA', MILLIQUAS_PARENT_SURVEY_BYTE.GAIA],
  ['NVSS', MILLIQUAS_PARENT_SURVEY_BYTE.NVSS],
];

/**
 * Translate a Milliquas Type column (e.g. `"Q   "`, `"K2  "`) into
 * the per-record class enum byte.  Only the first non-space char is
 * inspected — the trailing flags (R/X/2) are association markers
 * recoverable from the dedicated X-ray and radio ID columns if a
 * future pass needs them.
 *
 * Unrecognised letters return 0 (the "unclassified" sentinel) rather
 * than throwing — Milliquas occasionally introduces new class codes,
 * and a missing class is strictly better than a build failure.
 */
function classByteFromType(typeRaw: string): number {
  const letter = typeRaw[0] ?? '';
  switch (letter) {
    case 'Q':
      return MILLIQUAS_CLASS_BYTE.Q;
    case 'A':
      return MILLIQUAS_CLASS_BYTE.A;
    case 'B':
      return MILLIQUAS_CLASS_BYTE.B;
    case 'K':
      return MILLIQUAS_CLASS_BYTE.K;
    case 'N':
      return MILLIQUAS_CLASS_BYTE.N;
    case 'S':
      return MILLIQUAS_CLASS_BYTE.S;
    default:
      return 0;
  }
}

/**
 * Match the trimmed Name column against the known parent-survey
 * prefixes.  Returns the matching enum byte, or 0 for literature
 * designations (`3C 273`, `M 87`, …) and any unrecognised prefix.
 *
 * The match is strict: the prefix must be followed by a space — we
 * never want to confuse `SDSS J…` (parent survey) with a name like
 * `SDSSFAKE` that happens to start with the same five characters.
 */
function parentSurveyByteFromName(nameTrimmed: string): number {
  for (const [prefix, byte] of PARENT_PREFIX_BY_NAME) {
    if (nameTrimmed.length > prefix.length && nameTrimmed.startsWith(prefix + ' ')) {
      return byte;
    }
  }
  return 0;
}

/**
 * Read one Milliquas magnitude cell, returning NaN for "no measurement".
 *
 * Two rules compose here, and they are deliberately kept apart.
 *
 * The general one is `isPlausibleMagnitude`, shared with every other
 * parser: it rejects blanks and the numeric sentinels catalogs inherit from
 * their upstream sources.
 *
 * The Milliquas-specific one is the literal `0`. This catalog marks a
 * missing magnitude with `0`, NOT a blank — the Circinus row reads
 * `Rmag="10.93" Bmag=" 0 "`, meaning "R measured, B absent". Zero is
 * catastrophic downstream rather than merely wrong: a 4 Mpc galaxy at m=0
 * back-solves to M=-28, which the surface-brightness model reads as ~240x a
 * typical galaxy's luminosity. That is what made Circinus and the Milliquas
 * copy of Centaurus A render as blown-out white blobs (2169 rows carried
 * magG=0).
 *
 * The zero rule stays local because it is false in general — zero is a
 * perfectly good magnitude for a bright star (Vega is 0.03) — and true only
 * for THIS catalog: the brightest known AGN (3C 273) sits at ~12.9, so no
 * Milliquas row has a legitimate magnitude anywhere near zero.
 */
function milliquasMagOrNaN(cell: string): number {
  const v = parseFloat(cell);
  if (v === 0) return NaN;
  return isPlausibleMagnitude(v) ? v : NaN;
}

export type MilliquasParseResult = {
  records: ParsedRecord[];
  skipped: {
    zMissing: number;
    zNonPositive: number;
    photoZRounded: number;
    qsocRounded: number;
  };
};

export function parseMilliquas(rawText: string): MilliquasParseResult {
  const lines = nonCommentLines(rawText);

  const records: ParsedRecord[] = [];
  const skipped = { zMissing: 0, zNonPositive: 0, photoZRounded: 0, qsocRounded: 0 };

  for (const line of lines) {
    if (line.length < MIN_LINE_LEN) continue;

    const raStr = line.slice(RA_BYTES[0] - 1, RA_BYTES[1]).trim();
    const decStr = line.slice(DEC_BYTES[0] - 1, DEC_BYTES[1]).trim();
    const nameRaw = line.slice(NAME_BYTES[0] - 1, NAME_BYTES[1]);
    const typeRaw = line.slice(TYPE_BYTES[0] - 1, TYPE_BYTES[1]);
    const rmagStr = line.slice(RMAG_BYTES[0] - 1, RMAG_BYTES[1]).trim();
    const bmagStr = line.slice(BMAG_BYTES[0] - 1, BMAG_BYTES[1]).trim();
    const zRaw = line.slice(Z_BYTES[0] - 1, Z_BYTES[1]);
    const zciteTrimmed = line.slice(ZCITE_BYTES[0] - 1, ZCITE_BYTES[1]).trim();

    const ra = parseFloat(raStr);
    const dec = parseFloat(decStr);
    const z = parseFloat(zRaw);

    if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(z)) {
      skipped.zMissing++;
      continue;
    }
    // A quasar/AGN catalog has no physical z <= 0. A negative or zero
    // redshift is a bad measurement or a misclassified foreground star, not
    // a real blueshift — unlike 2MRS, whose Local Group members have genuine
    // negative cz. Left in, a negative z would run the redshift→distance map
    // to a negative radius and mirror the object through the origin to a
    // bogus antipodal position (a mag-8.6 "quasar" at z = -0.001 is the row
    // that motivated this). Drop any non-positive z.
    if (z <= 0) {
      skipped.zNonPositive++;
      continue;
    }
    if (PHOTO_Z_ROUNDED_TO_TENTH.test(zRaw)) {
      skipped.photoZRounded++;
      continue;
    }
    if (PHOTO_Z_ROUNDED_TO_HUNDREDTH.test(zRaw) && zciteTrimmed === ZCITE_GAIA_QSOC) {
      skipped.qsocRounded++;
      continue;
    }

    const magR = milliquasMagOrNaN(rmagStr);
    const magG = milliquasMagOrNaN(bmagStr);

    const nameTrimmed = nameRaw.trimEnd().trimStart();
    const classByte = classByteFromType(typeRaw);
    const parentSurveyByte = parentSurveyByteFromName(nameTrimmed);

    records.push({
      source: Source.Milliquas,
      objID: 0n,
      ra,
      dec,
      z,
      spectroscopicZ: z,
      magU: NaN,
      magG,
      magR,
      magI: NaN,
      magZ: NaN,
      axisRatio: null,
      positionAngleDeg: null,
      diameterKpc: null,
      // Per-record AGN class letter (Q/A/B/K/N/S → enum 1..6).
      classByte,
      // Per-record parent-survey prefix (SDSS/2MASX/GAIA/WISEA/NVSS/
      // FIRST/6dFGS → enum 1..7; literature designation → 0).
      parentSurveyByte,
    });
  }

  return { records, skipped };
}
