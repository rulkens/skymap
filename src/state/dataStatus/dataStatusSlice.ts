/**
 * dataStatusSlice — the serializable readiness descriptor (intent.md's "store a
 * descriptor, never the resource bytes"). catalogLoaded is dispatched from the
 * one cloud-commit path with the AssetSlot generation; the reducer records the
 * per-source number. The reconciler + deep-link + tier-reanchor sagas TAKE
 * catalogLoaded to re-resolve refs whose cloud just arrived. React never reads
 * this slice — it reads selectionRows, which the saga keeps current.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { dataStatusRoute } from '../../store/constants';
import type { DataStatusState } from '../../@types/store/DataStatusState';
import type { SourceType } from '../../@types/data/SourceType';

const dataStatusSlice = createSlice({
  name: dataStatusRoute,
  initialState: { catalogGen: {}, structureGen: 0 } as DataStatusState,
  reducers: {
    catalogLoaded: (
      dataStatus,
      action: PayloadAction<{ source: SourceType; generation: number }>,
    ) => {
      dataStatus.catalogGen[action.payload.source] = action.payload.generation;
    },
  },
});

export const { catalogLoaded } = dataStatusSlice.actions;

export default dataStatusSlice.reducer;
