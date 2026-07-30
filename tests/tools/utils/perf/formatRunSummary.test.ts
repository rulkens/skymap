/**
 * formatRunSummary — targeted assertions over the end-of-run cross-scenario
 * roll-up. Each pins ONE branch a real bug could break: a measured scenario's
 * total + hand-computed fps + budget verdict, the failed-scenario row (a roll-up
 * that silently dropped a crash would read as "all measured"), the colour-off
 * cleanliness, left-column alignment, and the empty-everything guard.
 */

import { describe, it, expect } from 'vitest';

import { formatRunSummary } from '../../../../tools/utils/perf/formatRunSummary';
import { ansiPalette } from '../../../../tools/utils/cli/ansiPalette';
import type { ScenarioReport } from '../../../../tools/perf/scenarioReport';

const plain = ansiPalette(false);

/** Only the merged total drives the roll-up; the rest is filler for the type. */
const reportWith = (scenario: string, median: number): ScenarioReport => ({
  scenario,
  viewport: { width: 1400, height: 900 },
  dpr: 2,
  frames: 30,
  tier: 'medium',
  totals: { merged: { median, p90: median }, perLayer: { median, p90: median } },
  merged: [],
  perLayer: [],
  floors: [],
  pageErrors: [],
});

describe('formatRunSummary', () => {
  it('renders a row per measured scenario with hand-computed fps and verdict', () => {
    const out = formatRunSummary(
      [reportWith('earth-surface', 3.2), reportWith('full-survey', 21.4)],
      ['star-field'],
      plain,
    );
    // 1000/3.2 = 312.5 → round 313; under 16.7 → green ✓ 60fps.
    expect(out).toMatch(/earth-surface[^\n]*3\.2[^\n]*313[^\n]*✓ 60fps/);
    // 1000/21.4 = 46.7 → round 47; 16.7..33.3 → yellow ⚠ 30–60fps.
    expect(out).toMatch(/full-survey[^\n]*21\.4[^\n]*47[^\n]*⚠ 30–60fps/);
  });

  it('includes a row for each failed scenario so a crash is never silently dropped', () => {
    const out = formatRunSummary([reportWith('earth-surface', 3.2)], ['star-field'], plain);
    expect(out).toMatch(/star-field[^\n]*✗ failed/);
  });

  it('marks an over-30fps scenario with the ✗ verdict', () => {
    const out = formatRunSummary([reportWith('heavy', 40.0)], [], plain);
    expect(out).toMatch(/heavy[^\n]*✗ <30fps/);
  });

  it('emits no ANSI escapes when the palette is disabled', () => {
    const out = formatRunSummary([reportWith('a', 3.2)], ['b'], plain);
    expect(out).not.toContain('\x1b');
  });

  it('aligns the left-anchored verdict column across rows of differing name width', () => {
    const out = formatRunSummary(
      [reportWith('earth-surface', 3.2), reportWith('full-survey', 21.4)],
      [],
      plain,
    );
    const rowOf = (needle: string): string => {
      const line = out.split('\n').find((l) => l.includes(needle));
      if (line === undefined) throw new Error(`no row containing ${needle}`);
      return line;
    };
    const rowA = rowOf('earth-surface');
    const rowB = rowOf('full-survey');
    // The verdict column is left-aligned, so '✓' and '⚠' share a start index
    // even though the scenario names differ in width.
    expect(rowA.indexOf('✓')).toBe(rowB.indexOf('⚠'));
    expect(rowA.indexOf('✓')).toBeGreaterThan(0);
  });

  it('returns an empty string when there is nothing to roll up', () => {
    expect(formatRunSummary([], [], plain)).toBe('');
  });
});
