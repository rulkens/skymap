import type { DeviceEvent } from '../input/DeviceEvent';
import type { RemoteCommand } from './RemoteCommand';

/** What a remote says. `hello` is the heartbeat and asks for a status now; `DeviceEvent.t` is the remote's own clock. */
export type RemoteMessageBody =
  | { kind: 'hello' }
  | { kind: 'command'; command: RemoteCommand }
  | { kind: 'device'; event: DeviceEvent }
  | { kind: 'search'; requestId: string; query: string };
