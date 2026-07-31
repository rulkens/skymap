/**
 * SkymapRecorderHook — the shape of `window.__skymapRecorder`, the ONLY seam
 * the Playwright recorder harness talks through.
 *
 * The harness drives the app from outside the page (`page.evaluate` +
 * CDP virtual time), so the contract is deliberately promise-shaped: an
 * awaited `page.evaluate(() => window.__skymapRecorder.ready)` blocks the
 * harness until the app is capture-ready, and `startTour(...)` resolves when
 * the tour-ended signal fires — no polling loops on the harness side, no
 * store access from `page.evaluate`. The alternative (the harness importing
 * selectors and reaching into the store from evaluated snippets) would couple
 * the harness to the store's internal layout; this one type — `ready` plus
 * the two `start*` promises — keeps the whole coupling surface in one place.
 */

import type { TourId } from '../animation/tour/TourId';
import type { BeatRange } from '../animation/tour/BeatRange';
import type { ClipId } from '../animation/ClipId';

export type SkymapRecorderHook = {
  /** Resolves once the engine is running and registered loading slots have settled. */
  readonly ready: Promise<void>;
  /**
   * Starts a tour (optionally windowed to a beat range); resolves when the
   * tour ends. Single-flight: rejects if a tour is already active — await the
   * previous call first.
   */
  readonly startTour: (id: TourId, beats?: BeatRange) => Promise<void>;
  /**
   * Plays one standalone clip; resolves when the clip ends. Single-flight:
   * rejects if a clip is already active. Never settles if the clip's foci
   * never resolve (no timeout on that wait) or if the saga throws; the
   * harness's frame cap is the real backstop.
   */
  readonly startClip: (id: ClipId) => Promise<void>;
};
