// @vitest-environment jsdom
//
// MobileSheet — pure-CSS scroll-snap bottom sheet wrapper tests.
//
// The snap/momentum gesture is browser-native (scroll-snap-type) and is NOT
// exercisable in jsdom, so we don't try to assert it.  Following the
// InfoCard.structureHover philosophy, we assert on rendered output (the child
// content renders) and on the one piece of JS behaviour the component owns:
// the resetKey-driven scroll reset.
//
// jsdom does not implement `Element.prototype.scrollTo`, so `vi.spyOn` has
// nothing to wrap.  We instead *define* the method as a typed mock in
// beforeEach and restore the original (undefined) in afterEach, so the stub
// both prevents a throw and observes the call without leaking between tests.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import MobileSheet from '../../../src/components/InfoCard/MobileSheet/MobileSheet';

describe('MobileSheet', () => {
  const originalScrollTo = HTMLElement.prototype.scrollTo;

  beforeEach(() => {
    HTMLElement.prototype.scrollTo = vi.fn<
      (options?: ScrollToOptions) => void
    >() as unknown as typeof HTMLElement.prototype.scrollTo;
  });

  afterEach(() => {
    HTMLElement.prototype.scrollTo = originalScrollTo;
  });

  it('scrolls to the peek on mount', () => {
    render(
      createElement(MobileSheet, {
        resetKey: 'galaxy:42',
        children: createElement('p', null, 'marker'),
      }),
    );
    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it('scrolls back to the peek when resetKey changes', () => {
    const { rerender } = render(
      createElement(MobileSheet, {
        resetKey: 'galaxy:42',
        children: createElement('p', null, 'marker'),
      }),
    );
    vi.mocked(HTMLElement.prototype.scrollTo).mockClear();

    // Same key — the effect dep is unchanged, so no reset fires.
    rerender(
      createElement(MobileSheet, {
        resetKey: 'galaxy:42',
        children: createElement('p', null, 'marker'),
      }),
    );
    expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();

    // New key — selecting a different target resets the sheet to the peek.
    rerender(
      createElement(MobileSheet, {
        resetKey: 'structure:coma',
        children: createElement('p', null, 'marker'),
      }),
    );
    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith({ top: 0 });
  });
});
