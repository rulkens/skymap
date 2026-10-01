/** Arrival selectors — the read seam for the `arrival` slice. */

import { arrivalRoute } from '../../store/constants';
import type { RootState } from '../../store/types';
import type { ArrivalState } from '../../@types/state/arrival/ArrivalState';

export const selectArrival = (state: RootState): ArrivalState => state[arrivalRoute];

export const selectArrivalPending = (state: RootState): boolean =>
  selectArrival(state).status === 'pending';
