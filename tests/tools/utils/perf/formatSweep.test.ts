/**
 * formatSweep — targeted substring + alignment assertions over the printed
 * sweep table, NOT a golden snapshot (a full snapshot trains blind re-blessing;
 * see testing.md). Each assertion pins ONE branch a real bug could break: a
 * pass's per-scale medians, its exponent and label, the TOTAL row, the
 * colour-off cleanliness, and column alignment (the ms columns of two rows of
 * different label width must start at the same character index).
 */

import { describe, it, expect } from 'vitest';

import { formatSweep } from '../../../../tools/utils/perf/formatSweep';
import { ansiPalette } from '../../../../tools/utils/cli/ansiPalette';
import type { SweepReport } from '../../../../tools/perf/sweepReport';

const plain = ansiPalette(false);

const report: SweepReport = {
  scenario: 'solar-system',
  dpr: 2,
  frames: 30,
  tier: 'medium',
  scales: [
    { scale: 0.5, width: 700, height: 450, pixels: 700 * 450 * 4 },
    { scale: 1.0, width: 1400, height: 900, pixels: 1400 * 900 * 4 },
    { scale: 2.0, width: 2800, height: 1800, pixels: 2800 * 1800 * 4 },
  ],
  passes: [
    {
      slot: 'hdr·NEAR0',
      perScaleMs: [1.2, 4.8, 19.2],
      exponent: 1.0,
      label: 'fragment/fill-bound',
    },
    {
      slot: 'orbit-trails',
      perScaleMs: [3.0, 3.1, 3.0],
      exponent: 0.0,
      label: 'vertex/CPU-bound',
    },
  ],
  total: { perScaleMs: [4.2, 7.9, 22.2], exponent: 0.85, label: 'fragment/fill-bound' },
  pageErrors: ['boom'],
};

describe('formatSweep', () => {
  it('renders each pass with its per-scale medians, exponent, and label', () => {
    const out = formatSweep(report, plain);
    expect(out).toMatch(
      /hdr·NEAR0[^\n]*1\.2[^\n]*4\.8[^\n]*19\.2[^\n]*1\.00[^\n]*fragment\/fill-bound/,
    );
    expect(out).toMatch(
      /orbit-trails[^\n]*3\.0[^\n]*3\.1[^\n]*3\.0[^\n]*0\.00[^\n]*vertex\/CPU-bound/,
    );
  });

  it('renders a TOTAL row with the whole-frame per-scale medians and exponent', () => {
    const out = formatSweep(report, plain);
    expect(out).toMatch(/TOTAL[^\n]*4\.2[^\n]*7\.9[^\n]*22\.2[^\n]*0\.85/);
  });

  it('lists the scales with their pixel counts in the header', () => {
    const out = formatSweep(report, plain);
    expect(out).toContain('solar-system');
    expect(out).toContain('sweep');
    expect(out).toContain('tier medium');
    expect(out).toContain('700×450');
    expect(out).toContain(String(1400 * 900 * 4));
  });

  it('surfaces the trailing page-error summary', () => {
    const out = formatSweep(report, plain);
    expect(out).toContain('⚠');
    expect(out).toContain('boom');
  });

  it('emits no ANSI escapes when the palette is disabled', () => {
    const out = formatSweep(report, plain);
    expect(out).not.toContain('\x1b');
  });

  it('aligns the ms columns across rows of differing label width', () => {
    const out = formatSweep(report, plain);
    const rowOf = (needle: string): string => {
      const line = out.split('\n').find((l) => l.includes(needle));
      if (line === undefined) throw new Error(`no row containing ${needle}`);
      return line;
    };
    // 'hdr·NEAR0' and 'orbit-trails' differ in label width; an aligned table
    // pads the label column so the first ms value starts at the same index.
    const rowA = rowOf('hdr·NEAR0');
    const rowB = rowOf('orbit-trails');
    expect(rowA.indexOf('1.2')).toBe(rowB.indexOf('3.0'));
    expect(rowA.indexOf('1.2')).toBeGreaterThan(0);
  });
});
