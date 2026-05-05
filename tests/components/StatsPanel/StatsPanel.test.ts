/**
 * Tests for StatsPanel.
 *
 * ### Why .test.ts not .test.tsx
 *
 * Same reason as the other component tests in this tree: vitest runs in
 * `node` env, no DOM library installed.  `react-dom/server.renderToStaticMarkup`
 * gives us the initial markup as a string, which is enough to verify all the
 * behavioural cases.
 *
 * ### What we cover
 *
 * StatsPanel is a pure function of its props.  We exercise each branch:
 *
 *   1. fps=0 → renders the em-dash placeholder (engine hasn't reported yet)
 *   2. fps>0 → renders the integer
 *   3. Rolled-up "Galaxies" total sums sourceCounts across visible-mask bits
 *   4. Galaxies total excludes sources whose visibility bit is OFF
 *   5. Galaxies total excludes Source.Synthetic even when its bit is on
 *   6. filamentsEnabled=false + counts non-null → row HIDDEN
 *   7. filamentsEnabled=true + counts present → row visible, comma-formatted
 *   8. Default mount is OPEN (aria-expanded="true" + body content visible)
 *   9. localStorage["skymap.stats.open"]="0" mounts closed
 *  10. localStorage["skymap.stats.open"]="1" mounts open
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StatsPanel } from '../../../src/components/StatsPanel/StatsPanel';
import { ALL_VISIBLE_MASK, Source } from '../../../src/data/sources';

// ── Minimal localStorage shim ────────────────────────────────────────────────
//
// Same pattern used in tests/components/SettingsPanel/CollapsibleSection.test.ts
// — Vitest's default `node` env has no `window` and no `localStorage`, so we
// install a Map-backed stub for the duration of each test.

type StorageShim = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  _store: Map<string, string>;
};

function makeStorageShim(): StorageShim {
  const store = new Map<string, string>();
  return {
    _store: store,
    getItem: (k) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
  };
}

let storage: StorageShim;

beforeEach(() => {
  storage = makeStorageShim();
  (globalThis as any).window = { localStorage: storage };
});

afterEach(() => {
  delete (globalThis as any).window;
});

describe('StatsPanel', () => {
  it('renders the STATS header', () => {
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        fps: 0,
        sourceCounts: {},
        visibleSourceMask: ALL_VISIBLE_MASK,
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
        visibleSourceMask: ALL_VISIBLE_MASK,
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
        visibleSourceMask: ALL_VISIBLE_MASK,
        filamentsEnabled: false,
        filamentCounts: null,
      }),
    );
    expect(html).toContain('60');
  });

  it('rolls source counts into a single Galaxies total when all bits are visible', () => {
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        fps: 0,
        sourceCounts: {
          [Source.SDSS]: 220_453,
          [Source.TwoMRS]: 44_000,
          [Source.Glade]: 2_400_000,
        },
        visibleSourceMask: ALL_VISIBLE_MASK,
        filamentsEnabled: false,
        filamentCounts: null,
      }),
    );
    expect(html).toContain('Galaxies');
    // 220,453 + 44,000 + 2,400,000 = 2,664,453
    expect(html).toContain('2,664,453');
    // No per-survey rows render any more — the rollup replaces them.
    expect(html).not.toContain('SDSS');
    expect(html).not.toContain('GLADE');
    expect(html).not.toContain('2MRS');
  });

  it('excludes sources whose visibility bit is off from the Galaxies total', () => {
    // SDSS toggled off (bit cleared) — only GLADE and 2MRS contribute.
    const sdssBit = 1 << Source.SDSS;
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        fps: 0,
        sourceCounts: {
          [Source.SDSS]: 220_453,
          [Source.TwoMRS]: 44_000,
          [Source.Glade]: 2_400_000,
        },
        visibleSourceMask: ALL_VISIBLE_MASK & ~sdssBit,
        filamentsEnabled: false,
        filamentCounts: null,
      }),
    );
    // 44,000 + 2,400,000 = 2,444,000 — SDSS dropped.
    expect(html).toContain('2,444,000');
    expect(html).not.toContain('2,664,453');
  });

  it('excludes Source.Synthetic from the Galaxies total even when its bit is set', () => {
    // Synthetic-fallback row would otherwise mislead users into thinking
    // procedural placeholder points are real galaxies.
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        fps: 0,
        sourceCounts: {
          [Source.Synthetic]: 100_000,
          [Source.SDSS]: 50,
        },
        visibleSourceMask: ALL_VISIBLE_MASK,
        filamentsEnabled: false,
        filamentCounts: null,
      }),
    );
    // Only the SDSS 50 contributes; Synthetic's 100,000 is excluded.
    expect(html).toContain('Galaxies');
    expect(html).toContain('>50<');
    expect(html).not.toContain('100,000');
    expect(html).not.toContain('100,050');
  });

  it('renders a Galaxies total of 0 when all surveys are toggled off', () => {
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        fps: 0,
        sourceCounts: { [Source.SDSS]: 220_453 },
        visibleSourceMask: 0,
        filamentsEnabled: false,
        filamentCounts: null,
      }),
    );
    expect(html).toContain('Galaxies');
    expect(html).toContain('>0<');
  });

  it('hides the filament row when filamentsEnabled is false even if counts are non-null', () => {
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        fps: 0,
        sourceCounts: {},
        visibleSourceMask: ALL_VISIBLE_MASK,
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
        visibleSourceMask: ALL_VISIBLE_MASK,
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
        visibleSourceMask: ALL_VISIBLE_MASK,
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

  // ── Collapse affordance ────────────────────────────────────────────────────

  it('mounts open by default (aria-expanded="true" + body visible)', () => {
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        fps: 60,
        sourceCounts: { [Source.SDSS]: 220_453 },
        visibleSourceMask: ALL_VISIBLE_MASK,
        filamentsEnabled: false,
        filamentCounts: null,
      }),
    );
    expect(html).toContain('aria-expanded="true"');
    // FPS row content present — load-bearing for "open".
    expect(html).toContain('FPS');
    expect(html).toContain('220,453');
  });

  it('mounts closed when localStorage["skymap.stats.open"] is "0"', () => {
    storage.setItem('skymap.stats.open', '0');
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        fps: 60,
        sourceCounts: { [Source.SDSS]: 220_453 },
        visibleSourceMask: ALL_VISIBLE_MASK,
        filamentsEnabled: false,
        filamentCounts: null,
      }),
    );
    expect(html).toContain('aria-expanded="false"');
    // We use conditional rendering for the body, so when collapsed the
    // FPS readout and Galaxies row are absent from the markup.
    expect(html).not.toContain('220,453');
  });

  it('mounts open when localStorage["skymap.stats.open"] is "1"', () => {
    storage.setItem('skymap.stats.open', '1');
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        fps: 60,
        sourceCounts: { [Source.SDSS]: 220_453 },
        visibleSourceMask: ALL_VISIBLE_MASK,
        filamentsEnabled: false,
        filamentCounts: null,
      }),
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('220,453');
  });
});
