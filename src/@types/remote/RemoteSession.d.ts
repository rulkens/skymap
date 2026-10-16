import type { DeviceEvent } from '../input/DeviceEvent';
import type { DomeStatus } from './DomeStatus';
import type { RemoteCommand } from './RemoteCommand';
import type { RemoteSearchMatch } from './RemoteSearchMatch';

/** What the remote page holds of its conversation with the dome, and how it speaks back. */
export type RemoteSession = {
  status: DomeStatus | null;
  /** False once three seconds pass without a status. */
  domeThere: boolean;
  matches: readonly RemoteSearchMatch[];
  sendCommand: (command: RemoteCommand) => void;
  sendDevice: (event: DeviceEvent) => void;
  search: (query: string) => void;
};
