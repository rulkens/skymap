import type { RemoteId } from './RemoteId';
import type { RemoteMessageBody } from './RemoteMessageBody';

/** Remote → dome. `v` is the sender's `REMOTE_PROTOCOL_VERSION`, stamped with `from` by the page's one `send`. */
export type RemoteMessage = { v: number; from: RemoteId } & RemoteMessageBody;
