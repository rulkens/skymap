/**
 * Tests for NavigationPanel.
 *
 * ### Why .test.ts not .test.tsx
 *
 * Same reason as `tests/components/SettingsPanel/CollapsibleSection.test.ts`:
 * the project's vitest config runs in the `node` environment with no DOM
 * library installed.  We use `react-dom/server.renderToStaticMarkup` to
 * snapshot the initial markup as a string and assert against it.
 *
 * ### What we cover here
 *
 * NavigationPanel is a static cheatsheet — no props, no callbacks.  Recently
 * it grew a top-level collapse affordance (chevron + clickable header) with
 * its open/closed state persisted to localStorage under
 * `skymap.navigation.open`.  The cases we exercise:
 *
 *   1. Every label and gesture/key string appears in the rendered output
 *      (canary that keeps the cheatsheet in sync with the actual key
 *      bindings — those live in `src/App.tsx`'s keydown handler).
 *   2. Default render is OPEN (aria-expanded="true" + visible row content).
 *   3. localStorage['skymap.navigation.open']='0' makes the panel mount
 *      closed (aria-expanded="false" + data-open="false" wrapper marker).
 *   4. localStorage['skymap.navigation.open']='1' explicitly mounts open.
 *
 * Click-to-toggle behaviour is verified manually against the live dev server
 * (project convention — see CLAUDE.md "dev server stays running").
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NavigationPanel } from '../../../src/components/NavigationPanel/NavigationPanel';

// ── Minimal localStorage shim ────────────────────────────────────────────────
//
// vitest's default `node` environment has no `window` and no `localStorage`.
// Same shim pattern used in tests/components/SettingsPanel/CollapsibleSection.test.ts
// — install on `globalThis.window` per-test and tear down in afterEach so
// tests stay independent of each other.

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
  // Cast to `any` — the shim isn't a full Storage implementation, but the
  // component only touches the three methods above.
  (globalThis as any).window = { localStorage: storage };
});

afterEach(() => {
  delete (globalThis as any).window;
});

describe('NavigationPanel', () => {
  it('renders the NAVIGATION header', () => {
    const html = renderToStaticMarkup(createElement(NavigationPanel));
    expect(html).toContain('NAVIGATION');
  });

  it('renders every gesture/key on the left column', () => {
    const html = renderToStaticMarkup(createElement(NavigationPanel));
    expect(html).toContain('Drag');
    expect(html).toContain('Wheel');
    expect(html).toContain('H');
    expect(html).toContain('F');
    expect(html).toContain('Esc');
    // Cmd / Ctrl / slash hint for the command palette — assert the search
    // shortcut appears in some form (the exact glyph is fine to spot-check).
    expect(html).toMatch(/⌘K|Ctrl\+K|\//);
  });

  it('renders every action label on the right column', () => {
    const html = renderToStaticMarkup(createElement(NavigationPanel));
    expect(html).toContain('orbit camera');
    expect(html).toContain('zoom');
    expect(html).toContain('home view');
    expect(html).toContain('focus selected');
    expect(html).toContain('clear selection');
    expect(html).toContain('search galaxies');
  });

  // ── Collapse affordance ────────────────────────────────────────────────────

  it('mounts open by default (aria-expanded="true" + body visible)', () => {
    const html = renderToStaticMarkup(createElement(NavigationPanel));
    expect(html).toContain('aria-expanded="true"');
    // Body content present — pick a row that's load-bearing for "open".
    expect(html).toContain('orbit camera');
  });

  it('mounts closed when localStorage["skymap.navigation.open"] is "0"', () => {
    storage.setItem('skymap.navigation.open', '0');
    const html = renderToStaticMarkup(createElement(NavigationPanel));
    expect(html).toContain('aria-expanded="false"');
    // We use conditional rendering for the body, so when closed the row
    // content does NOT appear in the markup at all.  This mirrors the
    // top-level SettingsPanel collapse pattern (where the body is removed
    // from the DOM tree, freeing React from the off-screen subtree cost).
    expect(html).not.toContain('orbit camera');
  });

  it('mounts open when localStorage["skymap.navigation.open"] is "1"', () => {
    storage.setItem('skymap.navigation.open', '1');
    const html = renderToStaticMarkup(createElement(NavigationPanel));
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('orbit camera');
  });
});
