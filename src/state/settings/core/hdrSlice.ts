/**
 * hdr — viewer opt-in plus the extended-range headroom knobs; see
 * `HdrSettings` for how `enabled` gates `knee`/`headroom` against the live
 * swap-chain format.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import {
  DEFAULT_HDR_ENABLED,
  DEFAULT_HDR_HEADROOM,
  DEFAULT_HDR_KNEE,
} from '../../../data/defaults';
import type { HdrSettings } from '../../../@types/settings/HdrSettings';

const initialState: HdrSettings = {
  enabled: DEFAULT_HDR_ENABLED,
  knee: DEFAULT_HDR_KNEE,
  headroom: DEFAULT_HDR_HEADROOM,
};

export const hdrSlice = createSlice({
  name: 'settings/hdr',
  reducerPath: 'hdr',
  initialState,
  reducers: {
    setHdrEnabled: (hdr, action: PayloadAction<boolean>) => {
      hdr.enabled = action.payload;
    },
    setHdrKnee: (hdr, action: PayloadAction<number>) => {
      hdr.knee = action.payload;
    },
    setHdrHeadroom: (hdr, action: PayloadAction<number>) => {
      hdr.headroom = action.payload;
    },
  },
});

export const { setHdrEnabled, setHdrKnee, setHdrHeadroom } = hdrSlice.actions;
