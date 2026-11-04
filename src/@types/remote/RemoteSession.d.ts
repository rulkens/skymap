import type { DeviceEvent } from '../input/DeviceEvent';
import type { DomeLinkState } from './DomeLinkState';
import type { DomeStatus } from './DomeStatus';
import type { RemoteMenu } from './RemoteMenu';
import type { RemoteCommand } from './RemoteCommand';
import type { RemoteSearchMatch } from './RemoteSearchMatch';
import type { TimeState } from '../time/TimeState';

/** What the remote page holds of its conversation with the dome, and how it speaks back. */
export type RemoteSession = {
  status: DomeStatus | null;
  /** The latest status's clock, anchored at its arrival so the phone can run it on between statuses. */
  clock: TimeState | null;
  link: DomeLinkState;
  /** Null until the dome's menu arrives; the lists render nothing before. */
  menu: RemoteMenu | null;
  matches: readonly RemoteSearchMatch[];
  sendCommand: (command: RemoteCommand) => void;
  sendDevice: (event: DeviceEvent) => void;
  search: (query: string) => void;
};
