/**
 * compareSlice — the compare-against-a-reference panel's live session: panel
 * visibility, the active reference id, a one-shot camera view-sync request,
 * and the async auto-fit run's progress/result. Unlike `galaxySlice`'s single
 * shallow-patch action, each field here has its own write path because the
 * fields don't move together on every dispatch — a view-sync request doesn't
 * touch the fit run, and a fit run doesn't touch the active reference.
 *
 * `fitStarted` is the one action that resets several fields at once, because
 * `fitting`/`fitProgress`/`fitScore`/`fitNote`/`report` all describe ONE run
 * (see `CompareState`'s docblock) — starting a new run must reset all five
 * together, not leave stale values from the previous run mixed with fresh
 * ones.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { ViewPose } from '../../../@types/engine/ViewPose';
import type { MatchReport } from '../../../@types/matcher/MatchReport';
import { DEFAULT_COMPARE_STATE } from '../../data/defaultCompareState';

const compareSlice = createSlice({
  name: 'compare',
  initialState: DEFAULT_COMPARE_STATE,
  reducers: {
    comparePanelToggled: (compare) => {
      compare.open = !compare.open;
    },
    referenceSelected: (compare, action: PayloadAction<string>) => {
      compare.activeId = action.payload;
      compare.report = null;
    },
    // One-shot request: the nonce lets the bridge distinguish a fresh
    // request from the same pose already sitting in state (see `viewIntent`
    // on `CompareState`).
    viewRequested: (compare, action: PayloadAction<ViewPose>) => {
      compare.viewIntent = {
        pose: action.payload,
        nonce: compare.viewIntent ? compare.viewIntent.nonce + 1 : 1,
      };
    },
    fitStarted: (compare) => {
      compare.fitting = true;
      compare.fitProgress = 0.02;
      compare.fitScore = null;
      compare.fitNote = 'reading photo…';
      compare.report = null;
      compare.stopRequested = false;
    },
    fitProgressed: (
      compare,
      action: PayloadAction<{ progress: number; score: number | null; note: string }>,
    ) => {
      compare.fitProgress = action.payload.progress;
      compare.fitScore = action.payload.score;
      compare.fitNote = action.payload.note;
    },
    fitReportSet: (compare, action: PayloadAction<MatchReport>) => {
      compare.report = action.payload;
    },
    fitFinished: (compare) => {
      compare.fitting = false;
      compare.stopRequested = false;
    },
    fitStopRequested: (compare) => {
      compare.stopRequested = true;
    },
  },
});

export const {
  comparePanelToggled,
  referenceSelected,
  viewRequested,
  fitStarted,
  fitProgressed,
  fitReportSet,
  fitFinished,
  fitStopRequested,
} = compareSlice.actions;
export default compareSlice.reducer;
