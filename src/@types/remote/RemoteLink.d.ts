import type { RemoteLinkStatus } from './RemoteLinkStatus';
import type { Unsubscribe } from './Unsubscribe';

/** One side's connection to a relay room: text in, text out, nothing parsed. */
export type RemoteLink = {
  /** Best effort, no acknowledgement. */
  send: (text: string) => void;
  onText: (listener: (text: string) => void) => Unsubscribe;
  onStatus: (listener: (status: RemoteLinkStatus) => void) => Unsubscribe;
  close: () => void;
};
