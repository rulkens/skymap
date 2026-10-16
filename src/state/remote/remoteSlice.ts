/** remoteSlice — the dome's pairing phase; only `remoteReceiverSaga` writes it. */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { RemoteState } from '../../@types/remote/RemoteState';
import type { RoomCode } from '../../@types/remote/RoomCode';

const initialState: RemoteState = { phase: 'off', code: null, pairingUrl: null };

const remoteSlice = createSlice({
  name: 'remote',
  initialState,
  reducers: {
    remotePairingStarted: (
      _remote,
      action: PayloadAction<{ code: RoomCode; pairingUrl: string | null }>,
    ): RemoteState => ({ phase: 'waiting', ...action.payload }),
    remotePaired: (remote) => {
      remote.phase = 'paired';
    },
  },
});

export const { remotePairingStarted, remotePaired } = remoteSlice.actions;

export default remoteSlice.reducer;
