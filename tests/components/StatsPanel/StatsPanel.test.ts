/**
 * Tests for StatsPanel.
 *
 * ### Why .test.ts not .test.tsx
 *
 * Same reason as the other component tests in this tree: vitest runs in
 * `node` env, no DOM library installed.  `react-dom/server.renderToStaticMarkup`
 * gives us the initial markup as a string, which is enough to verify all the
 * behavioural cases (FPS placeholder, comma formatting, conditional rows).
 *
 * ### What we cover
 *
 * StatsPanel is a pure function of its props — no state, no effects.  We
 * exercise each branch:
 *
 *   1. fps=0 → renders the em-dash placeholder (engine hasn't reported yet)
 *   2. fps>0 → renders the integer
 *   3. sourceCounts entry present → renders label + comma-formatted count
 *   4. filamentsEnabled=false + counts non-null → row HIDDEN
 *   5. filamentsEnabled=true + counts present → row visible, comma-formatted
 *   6. sourceCounts is empty → no per-source rows render
 */

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StatsPanel } from '../../../src/components/StatsPanel/StatsPanel';
import { Source } from '../../../src/data/sources';

describe('StatsPanel', () => {
  it('renders the STATS header', () => {
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        fps: 0,
        sourceCounts: {},
        filamentsEnabled: false,
        filamentCounts: null,
      }),
    );
    expect(html).toContain('STATS');
  });

  it('renders an em-dash for FPS when fps is 0', () => {
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        fps: 0,
        sourceCounts: {},
        filamentsEnabled: false,
        filamentCounts: null,
      }),
    );
    // The placeholder is an em-dash so the row reads "FPS · —" while the
    // engine spins up its first sample.
    expect(html).toContain('—');
    // And no integer FPS reading should be in the markup.
    expect(html).not.toMatch(/FPS[^·]*·\s*\d/);
  });

  it('renders the integer FPS reading when non-zero', () => {
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        fps: 60,
        sourceCounts: {},
        filamentsEnabled: false,
        filamentCounts: null,
      }),
    );
    expect(html).toContain('60');
  });

  it('renders a per-source row with comma-formatted count', () => {
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        fps: 0,
        sourceCounts: { [Source.SDSS]: 220453 },
        filamentsEnabled: false,
        filamentCounts: null,
      }),
    );
    expect(html).toContain('SDSS');
    expect(html).toContain('220,453');
  });

  it('omits per-source rows for sources not in sourceCounts', () => {
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        fps: 0,
        sourceCounts: { [Source.SDSS]: 100 },
        filamentsEnabled: false,
        filamentCounts: null,
      }),
    );
    // SDSS row should be present, but no other survey labels.
    expect(html).toContain('SDSS');
    expect(html).not.toContain('GLADE');
    expect(html).not.toContain('2MRS');
    expect(html).not.toContain('Famous');
  });

  it('hides the filament row when filamentsEnabled is false even if counts are non-null', () => {
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        fps: 0,
        sourceCounts: {},
        filamentsEnabled: false,
        filamentCounts: { stripCount: 3845, vertexCount: 27410 },
      }),
    );
    expect(html).not.toContain('Filaments');
    expect(html).not.toContain('strips');
  });

  it('hides the filament row when counts are null even if enabled', () => {
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        fps: 0,
        sourceCounts: {},
        filamentsEnabled: true,
        filamentCounts: null,
      }),
    );
    expect(html).not.toContain('Filaments');
    expect(html).not.toContain('strips');
  });

  it('renders the filament row with formatted strips and verts when enabled and counts present', () => {
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        fps: 0,
        sourceCounts: {},
        filamentsEnabled: true,
        filamentCounts: { stripCount: 3845, vertexCount: 27410 },
      }),
    );
    expect(html).toContain('Filaments');
    expect(html).toContain('3,845');
    expect(html).toContain('27,410');
    expect(html).toContain('strips');
    expect(html).toContain('verts');
  });
});
