/**
 * TourRuntimeState — the irreducible runtime facts of a playing guided tour,
 * held in the `tour` Redux slice. Everything else the overlay shows (the tour
 * label, beat count, the active caption, the dwell duration) is DERIVED by
 * selectors from `tourId` + `beatIndex` through `tourRegistry` — storing it
 * would duplicate the registry and risk drift.
 *
 * Fields:
 *   - `active`     — is a tour playing (gates the overlay mount).
 *   - `tourId`     — the registry key of the active tour ('' when inactive).
 *   - `beatIndex`  — the current beat (0-based); drives the "02 / 03" readout.
 *   - `paused`     — is the dwell countdown frozen (drives the nav play/pause
 *                    glyph and the CSS ring's `animation-play-state`).
 *   - `dwellNonce` — bumped when a beat's DWELL begins (after the establishing
 *                    fly lands), kept separate from `beatIndex` (which changes
 *                    at fly START) so the countdown ring restarts on landing,
 *                    not on the fly. The overlay keys the ring on it.
 *
 * The slice is single-writer: only the tour sagas mutate it. The keyboard /
 * nav request actions (`advanceTour`, `prevBeat`, `togglePause`, `exitTour`)
 * are reducer-less signals the sagas consume — they never write here directly.
 */

export type TourRuntimeState = {
  readonly active: boolean;
  readonly tourId: string;
  readonly beatIndex: number;
  readonly paused: boolean;
  readonly dwellNonce: number;
};
