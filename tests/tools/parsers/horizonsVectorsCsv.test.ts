import { describe, it, expect } from 'vitest';
import { parseHorizonsVectorsCsv } from '../../../tools/parsers/horizonsVectorsCsv';

// Trimmed from a real Horizons response (Mercury, 1900-01-01..03, CENTER 500@10).
const RESULT = `Reference frame : ICRF
*******************************************************************************
            JDUT ,            Calendar Date (UT ),                      X,                      Y,                      Z,
**************************************************************************************************************************
$$SOE
2415020.500000000, A.D. 1900-Jan-01 00:00:00.0000, -5.795103211328162E+07, -2.365718743126438E+07, -6.605861464973872E+06,
2415021.500000000, A.D. 1900-Jan-02 00:00:00.0000, -5.707774547111462E+07, -2.685144548110793E+07, -8.402394181703608E+06,
2415022.500000000, A.D. 1900-Jan-03 00:00:00.0000, -5.598502057837061E+07, -2.994254589329407E+07, -1.016666302505421E+07,
$$EOE
**************************************************************************************************************************
 Times PRIOR to 1962 are UT1, a mean-solar time closely related to the
`;

describe('parseHorizonsVectorsCsv', () => {
  it('parses the SOE/EOE block of a Horizons vectors result', () => {
    const rows = parseHorizonsVectorsCsv(RESULT);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      jd: 2415020.5,
      xKm: -5.795103211328162e7,
      yKm: -2.365718743126438e7,
      zKm: -6.605861464973872e6,
    });
    expect(rows[2]).toMatchObject({ jd: 2415022.5, zKm: -1.016666302505421e7 });
  });

  it('reads the velocity columns of a VEC_TABLE=2 result and omits them for VEC_TABLE=1', () => {
    const state = `$$SOE
2444124.500000000, A.D. 1977-Sep-05 00:00:00.0000, 1.5E+08, -2.5E+07, -1.1E+07, 1.5E+00, 2.9E+01, 1.2E+01,
$$EOE`;
    expect(parseHorizonsVectorsCsv(state)[0]).toEqual({
      jd: 2444124.5,
      xKm: 1.5e8,
      yKm: -2.5e7,
      zKm: -1.1e7,
      vxKmS: 1.5,
      vyKmS: 29,
      vzKmS: 12,
    });
    expect(Object.keys(parseHorizonsVectorsCsv(RESULT)[0]!)).toEqual(['jd', 'xKm', 'yKm', 'zKm']);
  });
});
