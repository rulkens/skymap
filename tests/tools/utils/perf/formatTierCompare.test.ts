/**
 * formatTierCompare — targeted substring + alignment assertions over the printed
 * tier-comparison table, NOT a golden snapshot (a full snapshot trains blind
 * re-blessing; see testing.md). Each assertion pins ONE branch a real bug could
 * break: the per-tier medians and the `—` null cell, the max-descending row
 * sort, the TOTAL row, the colour-off cleanliness + column alignment, and the
 * header naming the scenario.
 */

import { describe, it, expect } from 'vitest';

import { formatTierCompare } from '../../../../tools/utils/perf/formatTierCompare';
import { ansiPalette } from '../../../../tools/utils/cli/ansiPalette';
import type { TierCompareReport } from '../../../../tools/perf/tierCompareReport';

const plain = ansiPalette(false);

const report: TierCompareReport = {
  scenario: 'cosmic-web',
  viewport: { width: 1400, height: 900 },
  dpr: 2,
  frames: 30,
  tiers: ['small', 'medium', 'large'],
  passes: [
    // A SDSS-billing pass absent from `small` (source dropped there) → null cell.
    { slot: 'hdr·FAR', perTierMs: [null, 6.4, 12.8] },
    { slot: 'orbit-trails', perTierMs: [1.0, 1.1, 1.0] },
  ],
  total: { perTierMs: [4.2, 9.0, 16.5] },
  pageErrors: ['boom'],
};

describe('formatTierCompare', () => {
  it('renders each pass with its per-tier medians and a — for a null cell', () => {
    const out = formatTierCompare(report, plain);
    // hdr·FAR has no small-tier samples → em dash, then 6.4 / 12.8.
    expect(out).toMatch(/hdr·FAR[^\n]*—[^\n]*6\.4[^\n]*12\.8/);
    expect(out).toMatch(/orbit-trails[^\n]*1\.0[^\n]*1\.1[^\n]*1\.0/);
  });

  it('sorts rows by max non-null per-tier median descending', () => {
    const out = formatTierCompare(report, plain);
    const lines = out.split('\n');
    const idx = (slot: string): number => lines.findIndex((l) => l.includes(slot));
    // hdr·FAR peaks at 12.8, orbit-trails at 1.1 → hdr·FAR first.
    expect(idx('hdr·FAR')).toBeLessThan(idx('orbit-trails'));
  });

  it('renders a bold TOTAL row with the whole-frame per-tier medians', () => {
    const out = formatTierCompare(report, plain);
    expect(out).toMatch(/TOTAL[^\n]*4\.2[^\n]*9\.0[^\n]*16\.5/);
  });

  it('names the scenario and the tier-compare mode in the header', () => {
    const out = formatTierCompare(report, plain);
    expect(out).toContain('cosmic-web');
    expect(out).toContain('tier compare');
    expect(out).toContain('1400×900');
  });

  it('emits no ANSI escapes when the palette is disabled and aligns the ms columns', () => {
    const out = formatTierCompare(report, plain);
    expect(out).not.toContain('\x1b');
    const rowOf = (needle: string): string => {
      const line = out.split('\n').find((l) => l.includes(needle));
      if (line === undefined) throw new Error(`no row containing ${needle}`);
      return line;
    };
    // 'hdr·FAR' and 'orbit-trails' differ in label width; an aligned table pads
    // the label column so the medium-tier value starts at the same index. The
    // small cell on hdr·FAR is the em dash, so anchor on the medium column.
    const rowA = rowOf('hdr·FAR');
    const rowB = rowOf('orbit-trails');
    expect(rowA.indexOf('6.4')).toBe(rowB.indexOf('1.1'));
    expect(rowA.indexOf('6.4')).toBeGreaterThan(0);
  });

  it('surfaces the trailing page-error summary', () => {
    const out = formatTierCompare(report, plain);
    expect(out).toContain('⚠');
    expect(out).toContain('boom');
  });
});
