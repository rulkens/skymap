/**
 * catalogFromCsvColumns — a CSV's columns as read (createCsvColumnReader) into
 * the catalog under one set of import settings. Arithmetic over typed arrays
 * only, so a changed setting runs this again and never the text.
 *
 * Rows are checked in file order and the first problem refuses the whole file;
 * the reader's own problem comes after its last row, so it ranks the same as in
 * one pass. Ours, not the native build's: the RA/Dec range test (it catches x,
 * y, z read in the wrong format) and the float32 range tests.
 */
import type { CatalogFileProblem } from '../../@types/CatalogFileProblem';
import type { CatalogImportSettings } from '../../@types/CatalogImportSettings';
import type { CsvColumns } from '../../@types/CsvColumns';
import type { ParsedCsvCatalog } from '../../@types/ParsedCsvCatalog';
import { raDecDistToEqCart } from '../../../../src/utils/math/raDecDistToEqCart';
import { redshiftToDistanceMpc } from '../../../../src/utils/math/redshiftToDistanceMpc';
import { massWeightFromLog10 } from './massWeightFromLog10';
import { weightStatsFor } from './weightStatsFor';

const WRONG_FORMAT_HINT = 'Did you mean cartesian?';

export function catalogFromCsvColumns(
  columns: CsvColumns,
  settings: CatalogImportSettings,
): ParsedCsvCatalog | CatalogFileProblem {
  const { values, lines, count, firstLogOverflow } = columns;
  const { format, weight: weightSetting } = settings;
  const cosmology =
    format.kind === 'raDecRedshift' ? { h0KmSMpc: format.h0KmSMpc, omegaM: format.omegaM } : null;
  const positions = new Float32Array(count * 3);
  const weight = new Float32Array(count);

  let row = 0;
  const refuse = (message: string): CatalogFileProblem => ({
    kind: 'problem',
    message: `Line ${lines[row]}: ${message}`,
  });

  for (; row < count; row++) {
    const a = values[row * 4]!;
    const b = values[row * 4 + 1]!;
    const c = values[row * 4 + 2]!;
    const w = values[row * 4 + 3]!;

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
        return refuse(
          `weight ${firstLogOverflow?.text} is too large for log₁₀ of mass. Did you mean linear?`,
        );
      }
    }
    if (!(stored > 0 && stored < Infinity)) {
      return refuse('weight is outside the range a 32-bit float can hold');
    }

    const at = row * 3;
    if (cosmology) {
      if (b < -90 || b > 90) return refuse(`Dec ${b} is outside −90 to 90. ${WRONG_FORMAT_HINT}`);
      if (a < 0 || a > 360) return refuse(`RA ${a} is outside 0 to 360. ${WRONG_FORMAT_HINT}`);
      if (c < 0) return refuse('redshift must be 0 or more');
      const distMpc = redshiftToDistanceMpc(c, cosmology);
      positions.set(raDecDistToEqCart({ raHours: a / 15, decDeg: b, distMpc }), at);
    } else {
      positions[at] = a;
      positions[at + 1] = b;
      positions[at + 2] = c;
    }
    // Finite as read, but Float32 rounds past ±3.4e38 to Infinity.
    if (
      !Number.isFinite(positions[at]!) ||
      !Number.isFinite(positions[at + 1]!) ||
      !Number.isFinite(positions[at + 2]!)
    ) {
      return refuse('position is outside the range a 32-bit float can hold');
    }

    weight[row] = stored;
  }

  if (columns.problem !== null) return { kind: 'problem', message: columns.problem };
  if (count === 0) return { kind: 'problem', message: 'No data rows found' };
  return {
    kind: 'parsed',
    points: { positions, weight, count, sources: [] },
    weightStats: weightStatsFor(weight),
  };
}
