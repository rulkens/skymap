import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { Vec2 } from '../../../../../src/@types/math/Vec2';
import { groupSelected } from '../registry/registrySlice';
import type { SceneCamera } from '../view/viewSlice';

/** Rings are mesh-local metres, as `MeshOutline` stores them. */
export type OutlineEntry = { ringM: Vec2[]; masked: boolean };

export type OutlineDraft = {
  assetId: string;
  ringM: Vec2[];
  closed: boolean;
  /** The perspective pose draw mode left; Save and Discard both restore it. */
  returnPose: SceneCamera;
};

export type OutlineSlice = {
  byAssetId: Record<string, OutlineEntry>; // loaded / last saved
  draft: OutlineDraft | null; // non-null ⇔ draw mode
  saveError: string | null;
};

export const defaultOutlineSlice: OutlineSlice = { byAssetId: {}, draft: null, saveError: null };

export const outlineSlice = createSlice({
  name: 'outline',
  initialState: defaultOutlineSlice,
  reducers: {
    outlineLoaded: (state, action: PayloadAction<{ assetId: string; ringM: Vec2[] }>) => {
      state.byAssetId[action.payload.assetId] = { ringM: action.payload.ringM, masked: true };
    },
    maskToggled: (state, action: PayloadAction<string>) => {
      const entry = state.byAssetId[action.payload];
      if (entry) entry.masked = !entry.masked;
    },
    draftStarted: (state, action: PayloadAction<OutlineDraft>) => {
      state.draft = action.payload;
      state.saveError = null;
    },
    cornerAppended: (state, action: PayloadAction<Vec2>) => {
      if (state.draft && !state.draft.closed) state.draft.ringM.push(action.payload);
    },
    cornerMoved: (state, action: PayloadAction<{ index: number; xyM: Vec2 }>) => {
      const { index, xyM } = action.payload;
      // An out-of-range index (a stale drag after a delete) would otherwise append past the end.
      if (state.draft && index >= 0 && index < state.draft.ringM.length) {
        state.draft.ringM[index] = xyM;
      }
    },
    /** First corner of an open ring with ≥ 3 corners closes it; any other click deletes. */
    cornerClicked: (state, action: PayloadAction<number>) => {
      const draft = state.draft;
      if (!draft) return;
      if (!draft.closed && action.payload === 0 && draft.ringM.length >= 3) {
        draft.closed = true;
        return;
      }
      draft.ringM.splice(action.payload, 1);
      if (draft.ringM.length < 3) draft.closed = false;
    },
    outlineSaved: (state, action: PayloadAction<{ assetId: string; ringM: Vec2[] }>) => {
      state.byAssetId[action.payload.assetId] = { ringM: action.payload.ringM, masked: true };
    },
    outlineSaveFailed: (state, action: PayloadAction<string>) => {
      state.saveError = action.payload;
    },
    draftEnded: (state) => {
      state.draft = null;
    },
  },
  extraReducers: (builder) => {
    // Outlines belong to the group's assets; a switch drops them with the manifest.
    builder.addCase(groupSelected, () => defaultOutlineSlice);
  },
});

export const {
  outlineLoaded,
  maskToggled,
  draftStarted,
  cornerAppended,
  cornerMoved,
  cornerClicked,
  outlineSaved,
  outlineSaveFailed,
  draftEnded,
} = outlineSlice.actions;
