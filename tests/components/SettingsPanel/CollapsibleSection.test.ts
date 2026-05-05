/**
 * Tests for CollapsibleSection.
 *
 * ### Why .test.ts not .test.tsx
 *
 * The project's vitest config includes `tests/**\/*.test.ts` only, runs
 * in the `node` environment, and has no DOM library installed (no
 * happy-dom, no jsdom, no React Testing Library).  Adding any of those
 * just for this one component would be a heavier change than the
 * refactor it's supporting.
 *
 * Instead we test the two slices of behaviour that don't need a DOM:
 *
 *   1. The persistence helpers (`readSectionOpen`, `writeSectionOpen`)
 *      are pure functions over `globalThis.window.localStorage`.  We
 *      install a tiny in-memory shim and verify reads/writes round-trip,
 *      independent keys stay independent, and missing values fall back
 *      to `defaultOpen`.
 *
 *   2. The mount-time render is exercised via `renderToStaticMarkup`,
 *      which gives us the initial DOM tree as a string.  We can't
 *      drive clicks without a real DOM, but we *can* verify that
 *      mounting reads from localStorage — i.e. seeding `'0'` for a key
 *      makes the section render its closed state on the next mount.
 *
 * Toggle-via-click is covered by manual visual check against the live
 * dev server (project convention — see CLAUDE.md: "Dev server stays
 * running for HMR visual checks").
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CollapsibleSection,
  readSectionOpen,
  writeSectionOpen,
} from '../../../src/components/SettingsPanel/CollapsibleSection';

// ── Minimal localStorage shim ────────────────────────────────────────────────
//
// vitest's default `node` environment has no `window`, no `localStorage`.
// We install a Map-backed stub on `globalThis.window` for the duration of
// each test and remove it afterwards so tests stay independent of each
// other (and of any future test that genuinely wants no `window`).
//
// The shim covers the three methods CollapsibleSection actually uses:
// `getItem`, `setItem`, `removeItem`.  No need for `length` / `key` / etc.

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
  // Cast to `any` — the shim isn't a full Storage implementation, but
  // the component only touches the three methods above.
  (globalThis as any).window = { localStorage: storage };
});

afterEach(() => {
  delete (globalThis as any).window;
});

// ── readSectionOpen / writeSectionOpen ────────────────────────────────────────

describe('readSectionOpen', () => {
  it('returns defaultOpen when the key has never been written', () => {
    expect(readSectionOpen('never.written', true)).toBe(true);
    expect(readSectionOpen('never.written', false)).toBe(false);
  });

  it("returns true when the persisted value is '1'", () => {
    storage.setItem('foo', '1');
    expect(readSectionOpen('foo', false)).toBe(true);
  });

  it("returns false when the persisted value is '0'", () => {
    storage.setItem('foo', '0');
    expect(readSectionOpen('foo', true)).toBe(false);
  });

  it('falls back to defaultOpen when window is undefined (SSR)', () => {
    delete (globalThis as any).window;
    expect(readSectionOpen('whatever', true)).toBe(true);
    expect(readSectionOpen('whatever', false)).toBe(false);
    // Restore so afterEach's `delete` doesn't double-delete.
    (globalThis as any).window = { localStorage: storage };
  });

  it('falls back to defaultOpen when localStorage.getItem throws', () => {
    (globalThis as any).window = {
      localStorage: {
        getItem: () => {
          throw new Error('quota');
        },
        setItem: () => {},
        removeItem: () => {},
      },
    };
    expect(readSectionOpen('foo', true)).toBe(true);
    expect(readSectionOpen('foo', false)).toBe(false);
  });
});

describe('writeSectionOpen', () => {
  it("writes '1' for true and '0' for false", () => {
    writeSectionOpen('foo', true);
    expect(storage.getItem('foo')).toBe('1');
    writeSectionOpen('foo', false);
    expect(storage.getItem('foo')).toBe('0');
  });

  it('keeps independent keys independent', () => {
    writeSectionOpen('a', true);
    writeSectionOpen('b', false);
    expect(readSectionOpen('a', false)).toBe(true);
    expect(readSectionOpen('b', true)).toBe(false);
  });

  it('swallows setItem errors silently', () => {
    (globalThis as any).window = {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota');
        },
        removeItem: () => {},
      },
    };
    // Must not throw.
    expect(() => writeSectionOpen('foo', true)).not.toThrow();
  });
});

// ── Render-time persistence ──────────────────────────────────────────────────
//
// We render to a static string and assert on the resulting markup.
// Two facts about CollapsibleSection's output we can lean on:
//
//   - `aria-expanded="true"` vs `"false"` on the <button> tells us the
//     current open/closed state.
//   - The body div (and its children) only appear in the markup when
//     open — we conditionally render rather than `display: none`.

describe('CollapsibleSection initial render', () => {
  it('is open by default and shows children', () => {
    const html = renderToStaticMarkup(
      createElement(CollapsibleSection, {
        title: 'Surveys',
        storageKey: 'test.surveys',
        children: createElement('span', { 'data-testid': 'child' }, 'CHILD'),
      }),
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('CHILD');
  });

  it('respects defaultOpen=false on first visit', () => {
    const html = renderToStaticMarkup(
      createElement(CollapsibleSection, {
        title: 'Surveys',
        storageKey: 'test.unwritten',
        defaultOpen: false,
        children: createElement('span', null, 'CHILD'),
      }),
    );
    expect(html).toContain('aria-expanded="false"');
    // Children stay in the DOM when closed — collapse is a CSS-only
    // transition (grid-template-rows 0fr → 1fr) so the body never
    // unmounts.  Verify the closed state via the markers that DO
    // change: aria-expanded on the button, data-open on the wrapper,
    // aria-hidden on the wrapper.
    expect(html).toContain('data-open="false"');
    expect(html).toContain('aria-hidden="true"');
  });

  it('mounts closed when localStorage holds 0', () => {
    storage.setItem('test.persisted', '0');
    const html = renderToStaticMarkup(
      createElement(CollapsibleSection, {
        title: 'Surveys',
        storageKey: 'test.persisted',
        // defaultOpen omitted = true; persistence below should override.
        children: createElement('span', null, 'CHILD'),
      }),
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-open="false"');
  });

  it('mounts open when localStorage holds 1, even with defaultOpen=false', () => {
    storage.setItem('test.persisted', '1');
    const html = renderToStaticMarkup(
      createElement(CollapsibleSection, {
        title: 'Surveys',
        storageKey: 'test.persisted',
        defaultOpen: false,
        children: createElement('span', null, 'CHILD'),
      }),
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('CHILD');
  });

  // ── headerToggle (master on/off checkbox in the section header) ──────────
  //
  // The new optional prop pair lets a section render a master
  // checkbox between the chevron and the title.  Verified by
  // string-matching the static markup — the runtime click semantics
  // (collapse vs checkbox independence) are exercised manually
  // against the live dev server because JSDOM isn't installed.

  it('renders no header checkbox when headerToggle is omitted', () => {
    const html = renderToStaticMarkup(
      createElement(CollapsibleSection, {
        title: 'Surveys',
        storageKey: 'test.no-toggle',
        children: createElement('span', null, 'CHILD'),
      }),
    );
    // No <input type="checkbox"> in the header — the only inputs we
    // render are inside `children`, and we passed none here.
    expect(html).not.toContain('type="checkbox"');
  });

  it('renders a checked header checkbox when headerToggle=true', () => {
    const html = renderToStaticMarkup(
      createElement(CollapsibleSection, {
        title: 'Surveys',
        storageKey: 'test.toggle-on',
        headerToggle: true,
        onHeaderToggleChange: () => {},
        children: createElement('span', null, 'CHILD'),
      }),
    );
    expect(html).toContain('type="checkbox"');
    // React serialises `checked={true}` as the bare `checked`
    // attribute in static markup.
    expect(html).toMatch(/type="checkbox"[^>]*checked/);
  });

  it('renders an unchecked header checkbox when headerToggle=false', () => {
    const html = renderToStaticMarkup(
      createElement(CollapsibleSection, {
        title: 'Filaments',
        storageKey: 'test.toggle-off',
        headerToggle: false,
        onHeaderToggleChange: () => {},
        children: createElement('span', null, 'CHILD'),
      }),
    );
    expect(html).toContain('type="checkbox"');
    // Static markup omits the `checked` attribute when checked={false}.
    expect(html).not.toMatch(/type="checkbox"[^>]*checked/);
  });

  // The indeterminate visual state is set imperatively after mount via
  // `el.indeterminate = true` (see CollapsibleSection.tsx for the
  // rationale: it's a DOM IDL property, not a JSX-serialisable
  // attribute).  `renderToStaticMarkup` returns a string without ever
  // mounting a real DOM element, so we cannot exercise the
  // indeterminate state from this test environment — verified
  // manually against the dev server when SOME but not ALL surveys
  // are enabled.

  it('keeps two sections with different storageKeys independent', () => {
    storage.setItem('test.a', '0');
    storage.setItem('test.b', '1');

    const aHtml = renderToStaticMarkup(
      createElement(CollapsibleSection, {
        title: 'A',
        storageKey: 'test.a',
        children: createElement('span', null, 'A_CHILD'),
      }),
    );
    const bHtml = renderToStaticMarkup(
      createElement(CollapsibleSection, {
        title: 'B',
        storageKey: 'test.b',
        children: createElement('span', null, 'B_CHILD'),
      }),
    );

    // aria-expanded + data-open are the closed markers; children stay
    // in DOM (CSS-only collapse — see the matching note above).
    expect(aHtml).toContain('aria-expanded="false"');
    expect(aHtml).toContain('data-open="false"');

    expect(bHtml).toContain('aria-expanded="true"');
    expect(bHtml).toContain('data-open="true"');
    expect(bHtml).toContain('B_CHILD');
  });
});
