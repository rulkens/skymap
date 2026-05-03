import { describe, it, expect } from 'vitest';
import {
  parseHyperLedaMeandata,
  hyperLedaMeandataUrl,
} from '../../../tools/parsers/hyperledaMeandata';

/**
 * Real M31 (NGC 224) HyperLEDA fixture — header + data row taken
 * verbatim from a live `meandata` query at the time the parser was
 * written.  Used as the canonical regression case.
 *
 * The fixture exercises:
 *  - The trailing-space `objtype` quirk ("G ").
 *  - Numeric columns (logd25, logr25, pa, mod0).
 *  - Magnitudes with very large error bars (vt = 6.753 ± 3.548).
 *  - Empty cells (some columns are blank in the real response).
 */
const M31_HEADER =
  '$objname\t"pgc"\t"objtype"\t"al1950"\t"de1950"\t"al2000"\t"de2000"\t"l2"\t"b2"\t"sgl"\t"sgb"\t"f_astrom"\t"type"\t"bar"\t"ring"\t"multiple"\t"compactness"\t"t"\t"e_t"\t"agnclass"\t"logd25"\t"e_logd25"\t"logr25"\t"e_logr25"\t"pa"\t"brief"\t"e_brief"\t"ut"\t"e_ut"\t"bt"\t"e_bt"\t"vt"\t"e_vt"\t"it"\t"e_it"\t"kt"\t"e_kt"\t"m21"\t"e_m21"\t"mfir"\t"ube"\t"bve"\t"vmaxg"\t"e_vmaxg"\t"vmaxs"\t"e_vmaxs"\t"vdis"\t"e_vdis"\t"vrad"\t"e_vrad"\t"vopt"\t"e_vopt"\t"v"\t"e_v"\t"ag"\t"ai"\t"incl"\t"a21"\t"logdc"\t"btc"\t"itc"\t"ubtc"\t"bvtc"\t"bri25"\t"vrot"\t"e_vrot"\t"mg2"\t"e_mg2"\t"m21c"\t"hic"\t"vlg"\t"vgsr"\t"vvir"\t"v3k"\t"modz"\t"e_modz"\t"mod0"\t"e_mod0"\t"modbest"\t"e_modbest"\t"mabs"\t"e_mabs"';
const M31_DATA =
  'NGC0224\t2557\tG \t0.6666907\t40.9951518\t0.7123123\t41.2689778\t121.1743099\t-21.5730253\t336.193252\t12.5521848\t0\tSb\t\t\t\t\t3\t0.4\tQ\t3.25\t0.012\t0.407\t0.047\t35\t21.709\t0.316\t4.795\t0.251\t4.295\t0.251\t6.753\t3.548\t\t\t0.994\t0.017\t6.026\t0.149\t5.661\t0.56\t1.01\t244.38\t5.68\t73.81\t40.26\t153.85\t3.6\t-310\t3.9\t-266.3\t4.2\t-290\t15.5\t0.46\t0.572\t72.17\t0.05\t3.277\t3.265\t\t0.335\t0.744\t23.633\t256.7\t6.05\t0.243\t0.002\t5.971\t2.706\t-23.5\t-112.3\t-149.4\t-573.9\t\t\t24.462\t0.021\t24.462\t0.021\t-21.197\t0.252';
const M31_RESPONSE = `# This is a comment line\n${M31_HEADER}\n${M31_DATA}\n`;

describe('parseHyperLedaMeandata', () => {
  it('parses M31 (NGC 224) end-to-end with all key fields', () => {
    const row = parseHyperLedaMeandata(M31_RESPONSE);
    expect(row).not.toBeNull();
    expect(row!.objname).toBe('NGC0224');
    expect(row!.pgc).toBe('2557');
    // objtype has a trailing space in the wire format; trim happens inside.
    expect(row!.objtype).toBe('G');
    // RA in hours, dec in degrees.
    expect(row!.al2000).toBeCloseTo(0.7123123, 5);
    expect(row!.de2000).toBeCloseTo(41.2689778, 5);
    expect(row!.type).toBe('Sb');
    expect(row!.logd25).toBeCloseTo(3.25, 5);
    expect(row!.logr25).toBeCloseTo(0.407, 5);
    expect(row!.pa).toBe(35);
    expect(row!.bt).toBeCloseTo(4.295, 5);
    expect(row!.e_bt).toBeCloseTo(0.251, 5);
    // The "garbage" V-band: huge error bar.
    expect(row!.vt).toBeCloseTo(6.753, 5);
    expect(row!.e_vt).toBeCloseTo(3.548, 5);
    expect(row!.kt).toBeCloseTo(0.994, 5);
    expect(row!.e_kt).toBeCloseTo(0.017, 5);
    expect(row!.mod0).toBeCloseTo(24.462, 5);
    expect(row!.e_mod0).toBeCloseTo(0.021, 5);
    expect(row!.v3k).toBeCloseTo(-573.9, 5); // Local Group, falling toward us
    expect(row!.mabs).toBeCloseTo(-21.197, 5);
  });

  it('returns null when the response has only the header', () => {
    const row = parseHyperLedaMeandata(`# comments only\n${M31_HEADER}\n`);
    expect(row).toBeNull();
  });

  it('returns null when the header is missing entirely', () => {
    expect(parseHyperLedaMeandata('# nothing useful here\n')).toBeNull();
    expect(parseHyperLedaMeandata('')).toBeNull();
  });

  it('skips comment + dollar-prefixed lines between header and data', () => {
    // Inject extra comment + dollar lines after the header — the parser
    // should walk past them to the real data row.
    const noisy = `${M31_HEADER}\n# noise\n$another header\n${M31_DATA}\n`;
    const row = parseHyperLedaMeandata(noisy);
    expect(row).not.toBeNull();
    expect(row!.objname).toBe('NGC0224');
  });

  it('handles missing numeric cells as NaN, not 0', () => {
    // Build a minimal header + a data row with empty bt / vt / mod0 cells.
    const header =
      '$objname\t"pgc"\t"objtype"\t"al2000"\t"de2000"\t"bt"\t"e_bt"\t"vt"\t"e_vt"\t"mod0"\t"e_mod0"';
    const data = 'TEST\t1\tG \t10.0\t20.0\t\t\t\t\t\t';
    const row = parseHyperLedaMeandata(`${header}\n${data}\n`);
    expect(row).not.toBeNull();
    expect(Number.isNaN(row!.bt)).toBe(true);
    expect(Number.isNaN(row!.e_bt)).toBe(true);
    expect(Number.isNaN(row!.vt)).toBe(true);
    expect(Number.isNaN(row!.mod0)).toBe(true);
    // RA / Dec cells are present and parse correctly.
    expect(row!.al2000).toBe(10);
    expect(row!.de2000).toBe(20);
  });
});

describe('hyperLedaMeandataUrl', () => {
  it('URL-encodes the object name', () => {
    expect(hyperLedaMeandataUrl('NGC0224')).toContain('o=NGC0224');
    // Names with spaces (hypothetical) would get %20-encoded.
    expect(hyperLedaMeandataUrl('NGC 224')).toContain('o=NGC%20224');
  });
});
