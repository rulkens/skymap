/**
 * TourSetup — the optional establishing scene strip that fires before a tour's
 * first beat and is wound back in the guidedTourSaga finally.
 *
 * Setup effects are plain Redux actions dispatched in order inside the try block,
 * so the snapshot taken before them (via the captureScene selector) covers the
 * full mutation set and restoreSceneSaga returns the user's scene to exactly its
 * pre-tour state.
 *
 * Canonical setup effects are visibility toggles on the six captured clusters
 * (volumes, filaments, galaxyCatalogs, structures, milkyWay, flow). If a future
 * effect touches a cluster outside that set, captureSettings must be extended
 * before it can be safely wound back.
 */

import type { Action } from '@reduxjs/toolkit';

export type TourSetup = {
  readonly effects: readonly Action[];
};
