import { describe, expect, it } from 'vitest';

import type { SbdbQueryAnswer } from '../../../tools/@types/asteroids/SbdbQueryAnswer';
import { parseSbdbDiameters } from '../../../tools/asteroids/parseSbdbDiameters';

const answer = (fields: string[], data: (string | null)[][]): SbdbQueryAnswer => ({
  signature: { version: '1.0', source: 'test' },
  fields,
  count: data.length,
  data,
});

describe('parseSbdbDiameters', () => {
  it('reads columns by field name, so a reordered field list keeps diameter and albedo apart', () => {
    const rows = parseSbdbDiameters(
      answer(['albedo', 'diameter_sigma', 'diameter', 'pdes'], [['0.25', '0.06', '16.84', '433']]),
    );
    expect(rows).toEqual([{ number: 433, diameterKm: 16.84, albedo: 0.25 }]);
  });

  it('keeps a row with no albedo, as null', () => {
    const rows = parseSbdbDiameters(answer(['pdes', 'diameter', 'albedo'], [['9', '147.5', null]]));
    expect(rows[0]!.albedo).toBeNull();
  });

  it('fails the bake on a row that is not a numbered asteroid with a positive diameter', () => {
    const fields = ['pdes', 'diameter', 'albedo'];
    expect(() => parseSbdbDiameters(answer(fields, [['2004 MN4', '0.3', null]]))).toThrow(
      /bad row/,
    );
    expect(() => parseSbdbDiameters(answer(fields, [['12', null, null]]))).toThrow(/bad row/);
    expect(() => parseSbdbDiameters(answer(['pdes', 'albedo'], []))).toThrow(/"diameter"/);
  });
});
