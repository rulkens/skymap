import type { DomeMessageBody } from './DomeMessageBody';

/** Dome → remote; disjoint from `RemoteMessage`, so each side drops its own echoes. `v` is the sender's
 *  `REMOTE_PROTOCOL_VERSION`, stamped by the dome's one `send`. */
export type DomeMessage = { v: number } & DomeMessageBody;
