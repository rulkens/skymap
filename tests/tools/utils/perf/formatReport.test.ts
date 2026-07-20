/**
 * formatReport — targeted substring assertions over the printed report, NOT a
 * golden snapshot: a full-object snapshot would train blind re-blessing (see
 * testing.md), so each assertion pins ONE branch of the format that a real bug
 * could break — the header fields, a merged group row, a per-layer row, the
 * presence of a floor block when a group has ≥2 layers, and its ABSENCE when
 * `floors` is empty.
 *
 * The TOTAL block adds four more branches: the merged per-frame total (the
 * production number), its implied fps ceiling (a rounding a real bug could get
 * wrong), the per-layer total labeled "not representative", and the `n/a` fps
 * guard when the merged median is 0.
 *
 * The pretty/aligned rework adds three more: with color OFF the output carries
 * no `\x1b` escapes (so piped/JSON output stays clean), the table columns line
 * up (a real alignment bug would drift them), and the trailing `⚠` summary
 * de-duplicates `pageErrors` with per-message counts (absent when empty).
 */

import { describe, it, expect } from 'vitest';

import { formatReport } from '../../../../tools/utils/perf/formatReport';
import { ansiPalette } from '../../../../tools/utils/cli/ansiPalette';
import type { ScenarioReport } from '../../../../tools/perf/scenarioReport';

const plain = ansiPalette(false);

const withFloors: ScenarioReport = {
  scenario: 'solar-system',
  viewport: { width: 1400, height: 900 },
  dpr: 2,
  frames: 30,
  totals: {
    merged: { median: 14.8, p90: 17.2 },
    perLayer: { median: 22.5, p90: 26.0 },
  },
  merged: [
    { slot: 'hdr·NEAR0', median: 4.2, p90: 5.1 },
    { slot: 'foreground:0·NEAR0', median: 1.1, p90: 1.4 },
  ],
  perLayer: [
    { slot: 'orbit-trails', median: 3.6, p90: 4.0 },
    { slot: 'body-glints', median: 3.1, p90: 3.4 },
    { slot: 'star-points', median: 3.4, p90: 3.9 },
  ],
  floors: [
    {
      groupKey: 'hdr·NEAR0',
      floor: 2.9,
      reals: [
        { slot: 'orbit-trails', real: 0.7 },
        { slot: 'body-glints', real: 0.2 },
        { slot: 'star-points', real: 0.5 },
      ],
    },
  ],
  pageErrors: [],
};

describe('formatReport', () => {
  it('renders the header with viewport, dpr, and frame count', () => {
    const out = formatReport(withFloors, plain);
    expect(out).toContain('solar-system');
    expect(out).toContain('1400×900');
    expect(out).toContain('dpr2');
    expect(out).toContain('30 frames');
  });

  it('renders the merged per-frame TOTAL with median and p90', () => {
    const out = formatReport(withFloors, plain);
    // The production-basis per-frame total: median 14.8 | p90 17.2.
    expect(out).toMatch(/TOTAL \(merged, production\)[^\n]*14\.8[^\n]*17\.2/);
  });

  it('renders the implied fps ceiling rounded from the merged median', () => {
    const out = formatReport(withFloors, plain);
    // 1000 / 14.8 = 67.57 → Math.round → 68.
    expect(out).toMatch(/~68 fps GPU-bound ceiling/);
  });

  it('renders the per-layer TOTAL labeled as not representative', () => {
    const out = formatReport(withFloors, plain);
    expect(out).toMatch(/TOTAL \(per-layer[^\n]*not representative[^\n]*22\.5[^\n]*26\.0/);
  });

  it('prints n/a rather than Infinity for the fps ceiling when the merged median is 0', () => {
    const degenerate: ScenarioReport = {
      ...withFloors,
      totals: { merged: { median: 0, p90: 0 }, perLayer: { median: 0, p90: 0 } },
    };
    const out = formatReport(degenerate, plain);
    expect(out).toContain('~n/a fps');
    expect(out).not.toContain('Infinity');
  });

  it('renders a merged group row with its median and p90', () => {
    const out = formatReport(withFloors, plain);
    // The hdr·NEAR0 group row from the merged run: median 4.2 | p90 5.1.
    expect(out).toMatch(/hdr·NEAR0[^\n]*4\.2[^\n]*5\.1/);
  });

  it('renders a per-layer attribution row with its median', () => {
    const out = formatReport(withFloors, plain);
    expect(out).toMatch(/orbit-trails[^\n]*3\.6/);
  });

  it('renders a floor block for a group with ≥2 layers', () => {
    const out = formatReport(withFloors, plain);
    expect(out).toContain('EST. PER-PASS FLOOR');
    expect(out).toContain('2.9');
    // The floor-subtracted real cost for one of the layers.
    expect(out).toMatch(/orbit-trails[^\n]*0\.7[^\n]*real/);
  });

  it('omits any floor line when floors is empty', () => {
    const single: ScenarioReport = {
      scenario: 'earth-surface',
      viewport: { width: 1400, height: 900 },
      dpr: 2,
      frames: 30,
      totals: {
        merged: { median: 2.0, p90: 2.2 },
        perLayer: { median: 2.0, p90: 2.2 },
      },
      merged: [{ slot: 'hdr·NEAR0', median: 2.0, p90: 2.2 }],
      perLayer: [{ slot: 'atmosphere', median: 2.0, p90: 2.2 }],
      floors: [],
      pageErrors: [],
    };
    const out = formatReport(single, plain);
    expect(out).not.toContain('EST. PER-PASS FLOOR');
    expect(out).not.toContain('ms real');
  });

  it('emits no ANSI escapes when the palette is disabled', () => {
    const out = formatReport(withFloors, plain);
    expect(out).not.toContain('\x1b');
  });

  it('aligns each table so its rows share a start column for the numbers', () => {
    const out = formatReport(withFloors, plain);
    // The two merged rows (hdr·NEAR0, foreground:0·NEAR0) differ in label width;
    // an aligned table pads the label column so the median column begins at the
    // same character index on both rows. We assert that shared index directly
    // rather than snapshotting the whole block.
    const rowOf = (needle: string): string => {
      const line = out.split('\n').find((l) => l.includes(needle));
      if (line === undefined) throw new Error(`no row containing ${needle}`);
      return line;
    };
    const rowA = rowOf('hdr·NEAR0');
    const rowB = rowOf('foreground:0·NEAR0');
    // The median value 4.2 / 1.1 must start at the same column in both rows.
    expect(rowA.indexOf('4.2')).toBe(rowB.indexOf('1.1'));
    expect(rowA.indexOf('4.2')).toBeGreaterThan(0);
  });

  it('collapses pageErrors into a de-duplicated ⚠ summary with counts', () => {
    const withErrors: ScenarioReport = { ...withFloors, pageErrors: ['E', 'E', 'F'] };
    const out = formatReport(withErrors, plain);
    expect(out).toContain('⚠');
    // E occurred twice, F once — each unique message on ONE line with its count.
    const warnLines = out.split('\n').filter((l) => l.includes('⚠'));
    expect(warnLines).toHaveLength(2);
    expect(warnLines.some((l) => l.includes('E') && l.includes('2'))).toBe(true);
    expect(warnLines.some((l) => l.includes('F') && l.includes('1'))).toBe(true);
  });

  it('emits no ⚠ line when pageErrors is empty', () => {
    const out = formatReport(withFloors, plain);
    expect(out).not.toContain('⚠');
  });
});
