/**
 * TourRuntimeState — the irreducible runtime facts of a playing guided tour,
 * held in the `tour` Redux slice. Everything else the overlay shows (the tour
 * label, beat count, the active caption, the dwell duration) is DERIVED by
 * selectors from `tourId` + `beatIndex` through `tourRegistry` — storing it
 * would duplicate the registry and risk drift. Whether a tour is active at
 * all lives on the `takeover` slice (`selectTourActive` derives it), not here —
 * and the two part company during teardown: `tourEnded` resets this slice before
 * the takeover's restore and `takeoverEnded` run, so a window exists where
 * `selectTourActive` is true over `tourId === ''` and `beatIndex === 0`.
 *
 * Fields:
 *   - `tourId`     — the registry key of the active tour ('' when inactive).
 *   - `beatIndex`  — the current beat (0-based); drives the "02 / 03" readout.
 *   - `paused`     — is the dwell countdown frozen (drives the nav play/pause
 *                    glyph and the CSS ring's `animation-play-state`).
 *   - `dwellNonce` — bumped when a beat's DWELL begins (after the establishing
 *                    fly lands), kept separate from `beatIndex` (which changes
 *                    at fly START) so the countdown ring restarts on landing,
 *                    not on the fly. The overlay keys the ring on it.
 *   - `dwellSec`   — the active dwell's length in seconds (drives the ring's
 *                    CSS animation duration). A RUNTIME fact, not derivable by
 *                    selectors: it is the compiled duration of the beat's
 *                    RESOLVED `dwellClip` (a flyPath dwell needs foci resolved
 *                    before its duration is knowable), so `visitBeatSaga`
 *                    computes it and carries it on `dwellStarted`.
 *
 * The slice is single-writer: only `tourBodySaga` mutates it. The keyboard / nav
 * request actions (`advanceTour`, `prevBeat`, `togglePause`, `exitTakeover`)
 * are reducer-less signals the sagas consume — they never write here directly.
 */

export type TourRuntimeState = {
  readonly tourId: string;
  readonly beatIndex: number;
  readonly paused: boolean;
  readonly dwellNonce: number;
  readonly dwellSec: number;
};
