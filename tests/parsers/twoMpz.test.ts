import { describe, it, expect } from 'vitest';
import { parseTwoMpz } from '../../tools/parsers/twoMpz';
import { Source } from '../../src/data/sources';

const SAMPLE = `# 2MPZ catalogue header — implementer notes
# col1=ID  col2=RA  col3=Dec  col4=J  col5=H  col6=K  col13=ZPHOTO  col15=ZSPEC  col17=SDSS_OBJID
2MPZJ001      180.0   +30.0   12.3 11.5 10.7  0.0  0.0  0.0  0.0  0.0  0.0  0.0  0.08  0.01  0.085  0.0  1237651738291011584
2MPZJ002      200.0   -10.0   13.1 12.4 11.6  0.0  0.0  0.0  0.0  0.0  0.0  0.0  0.05  0.01   -1     0.0  0
2MPZJ003      120.0   +45.0   14.0 13.5 13.0  0.0  0.0  0.0  0.0  0.0  0.0  0.0   -1   0.0   -1     0.0  0
`;

describe('parseTwoMpz', () => {
  it('parses ZSPEC when present; falls back to ZPHOTO; skips rows with neither', () => {
    const { records, skipped } = parseTwoMpz(SAMPLE);
    expect(skipped).toBe(1);
    expect(records).toHaveLength(2);
    const r0 = records[0]!;
    expect(r0.source).toBe(Source.TwoMPZ);
    expect(r0.ra).toBeCloseTo(180);
    expect(r0.dec).toBeCloseTo(30);
    expect(r0.z).toBeCloseTo(0.085);
    expect(r0.objID).toBe(1237651738291011584n);
    expect(r0.magG).toBeCloseTo(12.3);
    expect(Number.isNaN(r0.magU)).toBe(true);

    const r1 = records[1]!;
    expect(r1.z).toBeCloseTo(0.05);
    expect(r1.objID).toBe(0n);
  });
});
