/**
 * tourSlice — the guided-tour runtime state, authored with inline Immer case
 * reducers. Single-writer: only the tour sagas dispatch these; the keyboard /
 * nav request actions (`advanceTour`, `prevBeat`, `togglePause`, `exitTour`)
 * are reducer-less signals the sagas consume, then translate into the writes
 * here. Routing pause through the saga (not letting `togglePause` flip the flag
 * directly) is deliberate — it keeps `paused` from ever drifting from the
 * saga's actual frozen/running state.
 *
 * The slice holds only the irreducible facts (see `TourRuntimeState`): the
 * label, beat count, active caption, and dwell duration the overlay renders are
 * all DERIVED by `selectors` from `tourId` + `beatIndex` through the registry.
 *
 * Reducer roles:
 *   - `tourStarted`  — a run begins: activate, record the id, reset to beat 0.
 *   - `beatChanged`  — a beat's establishing fly is starting: set the index and
 *                      clear `paused` (a fresh beat is never inherited-paused).
 *                      Does NOT bump the dwell nonce — the ring waits for the
 *                      fly to land.
 *   - `dwellStarted` — the fly landed and the interactive dwell begins: record
 *                      the dwell length (the resolved dwellClip's compiled
 *                      duration, computed by visitBeatSaga) and bump the nonce
 *                      so the overlay restarts the countdown ring.
 *   - `setPaused`    — the saga froze or resumed the dwell.
 *   - `tourEnded`    — natural finish or exit: back to the inert initial state.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { TourRuntimeState } from '../../@types/animation/tour/TourRuntimeState';

const initialState: TourRuntimeState = {
  active: false,
  tourId: '',
  beatIndex: 0,
  paused: false,
  dwellNonce: 0,
  dwellSec: 0,
};

const tourSlice = createSlice({
  name: 'tour',
  initialState,
  reducers: {
    tourStarted: (state, action: PayloadAction<{ tourId: string }>) => {
      state.active = true;
      state.tourId = action.payload.tourId;
      state.beatIndex = 0;
      state.paused = false;
      state.dwellNonce = 0;
      state.dwellSec = 0;
    },
    beatChanged: (state, action: PayloadAction<number>) => {
      state.beatIndex = action.payload;
      state.paused = false;
    },
    dwellStarted: (state, action: PayloadAction<{ dwellSec: number }>) => {
      state.dwellNonce += 1;
      state.dwellSec = action.payload.dwellSec;
    },
    setPaused: (state, action: PayloadAction<boolean>) => {
      state.paused = action.payload;
    },
    tourEnded: (state) => {
      state.active = false;
      state.tourId = '';
      state.beatIndex = 0;
      state.paused = false;
      state.dwellNonce = 0;
      state.dwellSec = 0;
    },
  },
});

export const { tourStarted, beatChanged, dwellStarted, setPaused, tourEnded } = tourSlice.actions;

export default tourSlice.reducer;
