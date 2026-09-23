/**
 * formatReport — only the two assertions that can fail on arithmetic rather than
 * on layout: the fps ceiling / headroom the verdict is computed from, and the
 * zero-median guard that would otherwise print `Infinity`.
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
  tier: 'medium',
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
  memory: { gpu: { totalBytes: 0, owners: [] }, jsHeapBytes: null },
};

describe('formatReport', () => {
  it('prints n/a rather than Infinity for the fps ceiling when the merged median is 0', () => {
    const degenerate: ScenarioReport = {
      ...withFloors,
      totals: { merged: { median: 0, p90: 0 }, perLayer: { median: 0, p90: 0 } },
    };
    const out = formatReport(degenerate, plain);
    expect(out).toContain('~n/a fps');
    expect(out).not.toContain('Infinity');
  });

  it('summarises a within-budget run with a ✓ and hand-computed headroom', () => {
    const out = formatReport(withFloors, plain);
    // merged median 14.8 → (1 - 14.8/16.7) = 0.1138 → round(11.38) = 11% headroom.
    expect(out).toContain('SUMMARY');
    expect(out).toMatch(/✓ Fits the 60fps budget with 11% headroom \(14\.8 of 16\.7 ms\)/);
  });
});
