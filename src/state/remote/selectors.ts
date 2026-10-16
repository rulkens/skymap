/** Remote selectors — the read seam for the `remote` slice. */

import { remoteRoute } from '../../store/constants';
import type { RootState } from '../../store/types';
import type { RemoteState } from '../../@types/remote/RemoteState';

export const selectRemote = (state: RootState): RemoteState => state[remoteRoute];
