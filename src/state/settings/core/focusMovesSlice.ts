/**
 * focusMoves — the focus-move style toggle and both styles' tuning. Absent from
 * `CORE_SNAPSHOT_CLUSTERS`, so a tour never flips the user's style. Only the
 * style is seeded from storage (at module load, when `INITIAL_SETTINGS` runs the
 * reducers); the tuning resets to the calibrated defaults on reload.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_FOCUS_MOVES } from '../../../data/camera/focusMoveDefaults';
import { FOCUS_MOVE_STYLE } from '../../persistedValues';
import { readPersisted } from '../../../utils/storage/readPersisted';
import type { FocusMoveSettings } from '../../../@types/settings/FocusMoveSettings';
import type { FocusMoveStyle } from '../../../@types/camera/FocusMoveStyle';
import type { GeodesicTuning } from '../../../@types/camera/GeodesicTuning';

const initialState: FocusMoveSettings = {
  ...DEFAULT_FOCUS_MOVES,
  style: readPersisted(FOCUS_MOVE_STYLE) ?? DEFAULT_FOCUS_MOVES.style,
};

export const focusMovesSlice = createSlice({
  name: 'settings/focusMoves',
  reducerPath: 'focusMoves',
  initialState,
  reducers: {
    setFocusMoveStyle: (moves, action: PayloadAction<FocusMoveStyle>) => {
      moves.style = action.payload;
    },
    // Floored at 1 ms here, the one home of the invariant: every reader divides by it.
    setEasedDuration: (moves, action: PayloadAction<number>) => {
      moves.eased.durationMs = Math.max(1, action.payload);
    },
    setGeodesicTuning: (moves, action: PayloadAction<Partial<GeodesicTuning>>) => {
      Object.assign(moves.geodesic, action.payload);
    },
  },
});

export const { setFocusMoveStyle, setEasedDuration, setGeodesicTuning } = focusMovesSlice.actions;
