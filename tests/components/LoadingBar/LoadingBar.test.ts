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

import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoadingBar } from '../../../src/components/LoadingBar/LoadingBar';
import { engineTelemetryStore } from '../../../src/state/engineTelemetryStore';
import type { LoadProgressState } from '../../../src/@types/loading/LoadProgressState';

// progress now comes from the shared telemetry store (read via
// `useEngineLoadProgress`), not a prop.  Seed the store, render, reset.
const setProgress = (p: LoadProgressState | null) =>
  engineTelemetryStore.getState().setLoadProgress(p);
afterEach(() => setProgress(null));

describe('LoadingBar', () => {
  it('renders nothing initially when progress is null and was always null', () => {
    // Internal `visible` state initialises from the first store read.
    // A null seed means the bar should be unmounted on first render.
    setProgress(null);
    const html = renderToStaticMarkup(createElement(LoadingBar));
    expect(html).toBe('');
  });

  it('renders a determinate fill when totalBytes is known', () => {
    setProgress({ loadedBytes: 5_000_000, totalBytes: 10_000_000, inFlightCount: 1 });
    const html = renderToStaticMarkup(createElement(LoadingBar));
    // The fill has an explicit width style derived from loaded/total.
    // 5 / 10 = 50 %.
    expect(html).toMatch(/width:\s*50%/);
    // ARIA progressbar with a numeric valuenow (rounded percentage).
    expect(html).toMatch(/aria-valuenow="50"/);
    expect(html).toMatch(/role="progressbar"/);
  });

  it('rounds the aria-valuenow to the nearest integer percent', () => {
    setProgress({ loadedBytes: 333, totalBytes: 1000, inFlightCount: 1 });
    const html = renderToStaticMarkup(createElement(LoadingBar));
    // 33.3 % rounds to 33.
    expect(html).toMatch(/aria-valuenow="33"/);
  });

  it('clamps the fill width at 100% when loadedBytes exceeds totalBytes', () => {
    // Misbehaving server (or a content-encoding quirk) could push
    // loadedBytes past totalBytes.  The fill shouldn't visually
    // overshoot.
    setProgress({ loadedBytes: 12_000, totalBytes: 10_000, inFlightCount: 1 });
    const html = renderToStaticMarkup(createElement(LoadingBar));
    expect(html).toMatch(/width:\s*100%/);
    expect(html).toMatch(/aria-valuenow="100"/);
  });

  it('renders an indeterminate bar when totalBytes is 0', () => {
    // Server didn't send Content-Length — total is 0 — UI falls back to
    // the indeterminate slider animation.
    setProgress({ loadedBytes: 4_000, totalBytes: 0, inFlightCount: 1 });
    const html = renderToStaticMarkup(createElement(LoadingBar));
    // Indeterminate styles come from the `_indeterminate_*` CSS module
    // class.  No inline width style, no aria-valuenow.
    expect(html).toMatch(/_indeterminate_/);
    expect(html).not.toMatch(/aria-valuenow="\d/);
    // ARIA contract: progressbar role still present, no valuenow attr
    // signals "indeterminate" per the WAI spec.
    expect(html).toMatch(/role="progressbar"/);
  });

  it('omits the trackHidden modifier class when progress is non-null', () => {
    // When at least one fetch is in flight (progress !== null) the track
    // mounts at full opacity — the `_trackHidden_*` CSS-module class
    // is only added on the falling edge to fade the bar out.
    setProgress({ loadedBytes: 1, totalBytes: 100, inFlightCount: 1 });
    const html = renderToStaticMarkup(createElement(LoadingBar));
    expect(html).not.toMatch(/_trackHidden_/);
    // Track itself is still in the DOM with the base class.
    expect(html).toMatch(/_track_/);
  });

  it('exposes an aria-label so screen readers know what is loading', () => {
    setProgress({ loadedBytes: 0, totalBytes: 1, inFlightCount: 1 });
    const html = renderToStaticMarkup(createElement(LoadingBar));
    expect(html).toMatch(/aria-label="Loading galaxy data"/);
  });
});
