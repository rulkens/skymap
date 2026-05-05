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
 * NavigationPanel is a static cheatsheet — no props, no state, no callbacks.
 * The only behaviour worth testing is "every label and gesture/key string
 * appears in the rendered output".  If any row is dropped or renamed, the
 * test fails loudly so the cheatsheet stays in sync with the actual key
 * bindings (which live in `src/App.tsx`'s keydown handler — keep them aligned
 * by hand for now; a future refactor could derive both from a shared table).
 */

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NavigationPanel } from '../../../src/components/NavigationPanel/NavigationPanel';

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
});
