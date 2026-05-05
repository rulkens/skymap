import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchTrigger } from '../../../src/components/SearchTrigger/SearchTrigger';

describe('SearchTrigger', () => {
  it('renders a button with the search affordance text', () => {
    const html = renderToStaticMarkup(
      createElement(SearchTrigger, { onClick: () => {} }),
    );
    expect(html).toMatch(/<button/);
    expect(html).toMatch(/Search galaxies/);
  });

  it('exposes the keyboard-shortcut hint via aria-keyshortcuts', () => {
    const html = renderToStaticMarkup(
      createElement(SearchTrigger, { onClick: () => {} }),
    );
    // aria-keyshortcuts must list at least Meta+K so screen readers
    // surface the shortcut to users who can't see the chip.
    expect(html).toMatch(/aria-keyshortcuts="[^"]*Meta\+K/);
  });

  it('applies the hidden class when hidden=true', () => {
    const visibleHtml = renderToStaticMarkup(
      createElement(SearchTrigger, { onClick: () => {}, hidden: false }),
    );
    const hiddenHtml = renderToStaticMarkup(
      createElement(SearchTrigger, { onClick: () => {}, hidden: true }),
    );
    // The hidden variant should have an extra class with "hidden" in it.
    expect(hiddenHtml.length).toBeGreaterThan(visibleHtml.length);
    // CSS-modules will mangle the class name but "hidden" stays as the
    // local part — match a class attribute that includes "hidden".
    expect(hiddenHtml).toMatch(/class="[^"]*hidden[^"]*"/);
  });

  it('renders an inline SVG search icon (no external icon dep)', () => {
    const html = renderToStaticMarkup(
      createElement(SearchTrigger, { onClick: () => {} }),
    );
    expect(html).toMatch(/<svg/);
    expect(html).toMatch(/<circle/);
  });
});
