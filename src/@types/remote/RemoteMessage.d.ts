import type { DeviceEvent } from '../input/DeviceEvent';
import type { RemoteCommand } from './RemoteCommand';
import type { RemoteId } from './RemoteId';

/** Remote → dome. `hello` is the heartbeat and asks for a status now; `DeviceEvent.t` is the remote's own clock.
 *  `v` is the sender's `REMOTE_PROTOCOL_VERSION`. */
export type RemoteMessage = { v: number; from: RemoteId } & (
  | { kind: 'hello' }
  | { kind: 'command'; command: RemoteCommand }
  | { kind: 'device'; event: DeviceEvent }
  | { kind: 'search'; requestId: string; query: string }
);
