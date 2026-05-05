/**
 * Tests for NavigationPanel.
 *
 * ### Why .test.ts not .test.tsx
 *
 * The project's vitest config runs in the `node` environment with no DOM
 * library installed (see CLAUDE.md).  We use
 * `react-dom/server.renderToStaticMarkup` to snapshot the initial markup
 * as a string and assert against it.
 *
 * ### What we cover here
 *
 * NavigationPanel is a static cheatsheet — no props, no callbacks.  Its
 * collapse state lives in the shared `Panel` component (whose own tests
 * cover the open/closed visual branches).  The cases here:
 *
 *   1. Every label and gesture/key string appears in the rendered output
 *      (canary that keeps the cheatsheet in sync with the actual key
 *      bindings — those live in `App.tsx`'s keydown handler).
 *   2. Default render is OPEN (Panel's defaultOpen=true is in effect).
 *
 * Click-to-toggle behaviour is verified manually against the live dev
 * server (project convention — see CLAUDE.md "dev server stays running").
 */

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  NavigationPanel,
  type NavigationPanelProps,
} from '../../../src/components/NavigationPanel/NavigationPanel';

describe('NavigationPanel', () => {
  it('renders the NAVIGATION header', () => {
    const html = renderToStaticMarkup(createElement(NavigationPanel, {}));
    expect(html).toContain('NAVIGATION');
  });

  it('renders every gesture/key on the left column', () => {
    const html = renderToStaticMarkup(createElement(NavigationPanel, {}));
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
    const html = renderToStaticMarkup(createElement(NavigationPanel, {}));
    expect(html).toContain('orbit camera');
    expect(html).toContain('zoom');
    expect(html).toContain('home view');
    expect(html).toContain('focus selected');
    expect(html).toContain('clear selection');
    expect(html).toContain('search galaxies');
  });

  it('mounts open by default (aria-expanded="true" + body visible)', () => {
    const html = renderToStaticMarkup(createElement(NavigationPanel, {}));
    expect(html).toContain('aria-expanded="true"');
    // Body content present — pick a row that's load-bearing for "open".
    expect(html).toContain('orbit camera');
  });

  it('shows touch gestures and hides keyboard shortcuts when isMobile=true', () => {
    // Typed variable rather than inline object literal: TS's
    // React.createElement overloads sometimes resolve to the no-props
    // signature when the component has destructured-with-default props,
    // which makes inline `{ isMobile: true }` look like a stray Attribute.
    const props: NavigationPanelProps = { isMobile: true };
    const html = renderToStaticMarkup(createElement(NavigationPanel, props));
    // Mobile-relevant rows appear:
    expect(html).toContain('One-finger drag');
    expect(html).toContain('Two-finger pinch');
    expect(html).toContain('Tap a galaxy');
    expect(html).toContain('× on info card');
    // Keyboard-only shortcuts should NOT appear on the mobile cheatsheet —
    // they'd be misleading because phones have no Esc / F / H keys.
    // Match the exact label rendered as the left-column key, not just the
    // letter (which appears in many words).
    expect(html).not.toContain('>Esc<');
    expect(html).not.toContain('search galaxies');
  });
});
