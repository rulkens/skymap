/**
 * parseHorizonsVectorsCsv — the data rows of a Horizons VECTORS result (CSV_FORMAT=YES):
 * everything between `$$SOE` and `$$EOE`. VEC_TABLE=1 columns are `JDUT, Calendar, X, Y, Z,`;
 * VEC_TABLE=2 appends `VX, VY, VZ,`, returned as velocities. The calendar column carries no
 * comma of its own, so a plain split is safe.
 */

import type { HorizonsVectorRow } from './@types/HorizonsVectorRow';

export function parseHorizonsVectorsCsv(result: string): HorizonsVectorRow[] {
  const start = result.indexOf('$$SOE');
  const end = result.indexOf('$$EOE');
  if (start < 0 || end < start) throw new Error('parseHorizonsVectorsCsv: no $$SOE/$$EOE block');

  return result
    .slice(start + '$$SOE'.length, end)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const cols = line.split(',').map((c) => c.trim());
      const hasVelocity = cols.length >= 8 && cols[5] !== '';
      const row = {
        jd: Number(cols[0]),
        xKm: Number(cols[2]),
        yKm: Number(cols[3]),
        zKm: Number(cols[4]),
        ...(hasVelocity && {
          vxKmS: Number(cols[5]),
          vyKmS: Number(cols[6]),
          vzKmS: Number(cols[7]),
        }),
      };
      if (!Object.values(row).every(Number.isFinite)) {
        throw new Error(`parseHorizonsVectorsCsv: unparseable row "${line}"`);
      }
      return row;
    });
}
