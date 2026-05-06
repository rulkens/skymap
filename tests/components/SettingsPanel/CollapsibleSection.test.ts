/**
 * Tests for CollapsibleSection.
 *
 * ### Why .test.ts not .test.tsx
 *
 * The project's vitest config runs in the `node` environment with no DOM
 * library installed (see CLAUDE.md).  We test the mount-time render via
 * `renderToStaticMarkup`, which gives us the initial DOM tree as a string.
 * We can't drive clicks without a real DOM, but the static branches —
 * defaultOpen, headerToggle visual state — are enough surface to keep
 * regressions out.  Toggle-via-click is verified manually against the live
 * dev server.
 *
 * ### What's covered
 *
 *   1. defaultOpen omitted = closed (the implicit default flipped from
 *      `true` to `false` so a fresh visitor sees a tidy panel of section
 *      headers rather than the full ~80-control wall).
 *   2. defaultOpen={true} renders open.
 *   3. defaultOpen={false} renders closed (children stay in DOM — collapse
 *      is CSS-only, see comments below).
 *   4. headerToggle prop pair renders the master checkbox in the correct
 *      checked/unchecked visual state.
 */

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CollapsibleSection } from '../../../src/components/SettingsPanel/CollapsibleSection';

describe('CollapsibleSection initial render', () => {
  it('is closed by default (collapsed first impression)', () => {
    const html = renderToStaticMarkup(
      createElement(CollapsibleSection, {
        title: 'Surveys',
        children: createElement('span', { 'data-testid': 'child' }, 'CHILD'),
      }),
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toMatch(/_bodyWrapperOpen_/);
  });

  it('respects defaultOpen=true on first visit', () => {
    const html = renderToStaticMarkup(
      createElement(CollapsibleSection, {
        title: 'Surveys',
        defaultOpen: true,
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
        defaultOpen: false,
        children: createElement('span', null, 'CHILD'),
      }),
    );
    expect(html).toContain('aria-expanded="false"');
    // Children stay in the DOM when closed — collapse is a CSS-only
    // transition (grid-template-rows 0fr → 1fr) so the body never
    // unmounts.  Verify the closed state via the markers that DO change:
    // aria-expanded on the button, absence of the `bodyWrapperOpen`
    // CSS-module modifier on the wrapper, aria-hidden on the wrapper.
    expect(html).not.toMatch(/_bodyWrapperOpen_/);
    expect(html).toContain('aria-hidden="true"');
  });

  // ── headerToggle (master on/off checkbox in the section header) ──────────
  //
  // The optional prop pair lets a section render a master checkbox between
  // the chevron and the title.  Verified by string-matching the static
  // markup — the runtime click semantics (collapse vs checkbox
  // independence) are exercised manually against the live dev server.

  it('renders no header checkbox when headerToggle is omitted', () => {
    const html = renderToStaticMarkup(
      createElement(CollapsibleSection, {
        title: 'Surveys',
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
        headerToggle: true,
        onHeaderToggleChange: () => {},
        children: createElement('span', null, 'CHILD'),
      }),
    );
    expect(html).toContain('type="checkbox"');
    // React serialises `checked={true}` as the bare `checked` attribute
    // in static markup.
    expect(html).toMatch(/type="checkbox"[^>]*checked/);
  });

  it('renders an unchecked header checkbox when headerToggle=false', () => {
    const html = renderToStaticMarkup(
      createElement(CollapsibleSection, {
        title: 'Filaments',
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
  // mounting a real DOM element, so we cannot exercise the indeterminate
  // state from this test environment — verified manually against the dev
  // server when SOME but not ALL surveys are enabled.
});
