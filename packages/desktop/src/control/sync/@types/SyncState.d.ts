import type { ControlState } from '../../../@types/ControlState';

/** The part of main's state the download's words and buttons read. */
export type SyncState = Pick<
  ControlState,
  'status' | 'progress' | 'hasData' | 'skyRunning' | 'skyLoading'
>;
