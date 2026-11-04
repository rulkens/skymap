import type { ControlStatus } from '../@types/ControlStatus';
import { formatGigabytes } from './formatGigabytes';

/** The sync panel's status line; without saved data the sky cannot start, so that case says so. */
export function controlStatusText(status: ControlStatus): string {
  switch (status.kind) {
    case 'idle':
      return 'No update running';
    case 'syncing':
      return 'Updating data';
    case 'ready':
      return 'New data ready · Restart sky';
    case 'offline':
      return status.hasData
        ? 'No connection. The sky uses the saved data.'
        : 'Skymap needs the internet once to download its data.';
    case 'failed':
      return status.hasData
        ? 'The update stopped. The sky uses the saved data.'
        : 'The download stopped. Skymap needs the internet once to finish it.';
    case 'diskFull':
      return `Not enough disk space: needs ${formatGigabytes(status.neededBytes)}, ${formatGigabytes(status.freeBytes)} free. Free some space, then retry.`;
  }
}
