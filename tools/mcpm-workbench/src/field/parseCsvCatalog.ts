/**
 * parseCsvCatalog — a visitor's CSV into catalog points, in the page.
 *
 * Line rules follow the native build (Polyphorm/cpplib/dataset.cpp:36-72): a
 * line is data when it starts with a digit, sign or dot, anything else is
 * skipped; fields split on comma, semicolon, tab or spaces; columns past the
 * fourth are ignored. The first problem refuses the whole file. Ours, not the
 * native build's: the RA/Dec range test (it catches x, y, z read in the wrong
 * format) and refusing an empty field, which would shift every later column.
 */
import type { CatalogFileProblem } from '../../@types/CatalogFileProblem';
import type { CatalogImportSettings } from '../../@types/CatalogImportSettings';
import type { CatalogPoints } from '../../@types/CatalogPoints';
import type { WeightStats } from '../../@types/WeightStats';
import { raDecDistToEqCart } from '../../../../src/utils/math/raDecDistToEqCart';
import { redshiftToDistanceMpc } from '../../../../src/utils/math/redshiftToDistanceMpc';
import { massWeightFromLog10 } from './massWeightFromLog10';
import { weightStatsFor } from './weightStatsFor';

const DATA_LINE = /^\s*[0-9+\-.]/;
// A comma or semicolon is one field boundary; a run of spaces or tabs is one too.
const FIELD_SEPARATOR = /\s*[,;]\s*|[\t ]+/;
const COLUMNS = 4;
const WRONG_FORMAT_HINT = 'Did you mean cartesian?';

export function parseCsvCatalog(
  text: string,
  settings: CatalogImportSettings,
):
  | {
      readonly ok: true;
      readonly points: CatalogPoints;
      readonly skippedLines: number;
      readonly weightStats: WeightStats;
    }
  | { readonly ok: false; readonly problem: CatalogFileProblem } {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop(); // a final newline is not a blank line

  const { format, weight: weightSetting } = settings;
  const cosmology =
    format.kind === 'raDecRedshift' ? { h0KmSMpc: format.h0KmSMpc, omegaM: format.omegaM } : null;
  // Sized for every line being data; trimmed to `count` at the end.
  const positions = new Float32Array(lines.length * 3);
  const weight = new Float32Array(lines.length);
  let count = 0;
  let skippedLines = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!DATA_LINE.test(line)) {
      skippedLines++;
      continue;
    }
    const refuse = (message: string) =>
      ({ ok: false, problem: { line: i + 1, message: `Line ${i + 1}: ${message}` } }) as const;

    const fields = line.trim().split(FIELD_SEPARATOR);
    while (fields.at(-1) === '') fields.pop(); // trailing separators
    if (fields.length < COLUMNS) return refuse(`expected 4 numbers, found ${fields.length}`);
    // Number('') is 0, so an empty field would read as a zero.
    if (fields.slice(0, COLUMNS).includes('')) return refuse('every value must be a finite number');
    const a = Number(fields[0]);
    const b = Number(fields[1]);
    const c = Number(fields[2]);
    const w = Number(fields[3]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
      return refuse('every value must be a finite number');
    }

    // Tested as stored in Float32: one Infinity zeroes every deposit, built-ins too.
    let stored: number;
    if (weightSetting.kind === 'linear') {
      const scaled = w * weightSetting.scale;
      if (!(scaled > 0)) return refuse('weight must be greater than 0');
      stored = Math.fround(scaled);
    } else {
      if (!Number.isFinite(w)) return refuse('every value must be a finite number');
      stored = Math.fround(massWeightFromLog10(w));
      if (stored === Infinity) {
        return refuse(`weight ${fields[3]} is too large for log₁₀ of mass. Did you mean linear?`);
      }
    }
    if (!(stored > 0 && stored < Infinity)) {
      return refuse('weight is outside the range a 32-bit float can hold');
    }

    if (cosmology) {
      if (b < -90 || b > 90) return refuse(`Dec ${b} is outside −90 to 90. ${WRONG_FORMAT_HINT}`);
      if (a < 0 || a > 360) return refuse(`RA ${a} is outside 0 to 360. ${WRONG_FORMAT_HINT}`);
      if (c < 0) return refuse('redshift must be 0 or more');
      const distMpc = redshiftToDistanceMpc(c, cosmology);
      positions.set(raDecDistToEqCart({ raHours: a / 15, decDeg: b, distMpc }), count * 3);
    } else {
      positions[count * 3] = a;
      positions[count * 3 + 1] = b;
      positions[count * 3 + 2] = c;
    }

    weight[count] = stored;
    count++;
  }

  if (count === 0) return { ok: false, problem: { line: null, message: 'No data rows found' } };

  const keptWeight = weight.slice(0, count);
  return {
    ok: true,
    points: { positions: positions.slice(0, count * 3), weight: keptWeight, count, sources: [] },
    skippedLines,
    weightStats: weightStatsFor(keptWeight),
  };
}
