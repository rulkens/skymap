/**
 * Tests for LoadingBar.
 *
 * Vitest runs in node with no DOM library installed (project convention —
 * see CLAUDE.md), so we render to a static HTML string via
 * `react-dom/server.renderToStaticMarkup` and assert against the markup.
 * The fade-out delay is timer-driven via React's useEffect; the tests
 * here only cover the initial-render branches that are observable in
 * static markup.  The fade visual itself is verified manually against
 * the live dev server (project convention).
 */

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoadingBar } from '../../../src/components/LoadingBar/LoadingBar';

describe('LoadingBar', () => {
  it('renders nothing initially when progress is null and was always null', () => {
    // Internal `visible` state initialises from the first `progress` prop.
    // A null seed means the bar should be unmounted on first render.
    const html = renderToStaticMarkup(createElement(LoadingBar, { progress: null }));
    expect(html).toBe('');
  });

  it('renders a determinate fill when totalBytes is known', () => {
    const html = renderToStaticMarkup(
      createElement(LoadingBar, {
        progress: { loadedBytes: 5_000_000, totalBytes: 10_000_000, inFlightCount: 1 },
      }),
    );
    // The fill has an explicit width style derived from loaded/total.
    // 5 / 10 = 50 %.
    expect(html).toMatch(/width:\s*50%/);
    // ARIA progressbar with a numeric valuenow (rounded percentage).
    expect(html).toMatch(/aria-valuenow="50"/);
    expect(html).toMatch(/role="progressbar"/);
  });

  it('rounds the aria-valuenow to the nearest integer percent', () => {
    const html = renderToStaticMarkup(
      createElement(LoadingBar, {
        progress: { loadedBytes: 333, totalBytes: 1000, inFlightCount: 1 },
      }),
    );
    // 33.3 % rounds to 33.
    expect(html).toMatch(/aria-valuenow="33"/);
  });

  it('clamps the fill width at 100% when loadedBytes exceeds totalBytes', () => {
    // Misbehaving server (or a content-encoding quirk) could push
    // loadedBytes past totalBytes.  The fill shouldn't visually
    // overshoot.
    const html = renderToStaticMarkup(
      createElement(LoadingBar, {
        progress: { loadedBytes: 12_000, totalBytes: 10_000, inFlightCount: 1 },
      }),
    );
    expect(html).toMatch(/width:\s*100%/);
    expect(html).toMatch(/aria-valuenow="100"/);
  });

  it('renders an indeterminate bar when totalBytes is 0', () => {
    // Server didn't send Content-Length — total is 0 — UI falls back to
    // the indeterminate slider animation.
    const html = renderToStaticMarkup(
      createElement(LoadingBar, {
        progress: { loadedBytes: 4_000, totalBytes: 0, inFlightCount: 1 },
      }),
    );
    // Indeterminate styles come from the `_indeterminate_*` CSS module
    // class.  No inline width style, no aria-valuenow.
    expect(html).toMatch(/_indeterminate_/);
    expect(html).not.toMatch(/aria-valuenow="\d/);
    // ARIA contract: progressbar role still present, no valuenow attr
    // signals "indeterminate" per the WAI spec.
    expect(html).toMatch(/role="progressbar"/);
  });

  it('marks the track as visible via data-visible="true" when progress is non-null', () => {
    const html = renderToStaticMarkup(
      createElement(LoadingBar, {
        progress: { loadedBytes: 1, totalBytes: 100, inFlightCount: 1 },
      }),
    );
    expect(html).toMatch(/data-visible="true"/);
  });

  it('exposes an aria-label so screen readers know what is loading', () => {
    const html = renderToStaticMarkup(
      createElement(LoadingBar, {
        progress: { loadedBytes: 0, totalBytes: 1, inFlightCount: 1 },
      }),
    );
    expect(html).toMatch(/aria-label="Loading galaxy data"/);
  });
});
