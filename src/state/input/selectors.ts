/** Input selectors — the frame reads `pending`, the pick driver reads `pick`. */

import { inputRoute } from '../../store/constants';
import type { RootState } from '../../store/types';
import type { InputState } from '../../@types/input/InputState';
import type { PendingStep } from '../../@types/input/PendingStep';

export const selectPendingInput = (state: RootState): readonly PendingStep[] =>
  state[inputRoute].pending;

export const selectPickRequests = (state: RootState): InputState['pick'] => state[inputRoute].pick;
