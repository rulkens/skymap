import type { ControlStatus } from '../@types/ControlStatus';
import type { SyncProgress } from '../@types/SyncProgress';
import { formatGigabytes } from './formatGigabytes';

/**
 * The download's status line. Without saved data the sky cannot start, so those cases say so; `idle`
 * reads off the last progress and the sky, because main is idle both before a first sync and after it.
 */
export function controlStatusText(
  status: ControlStatus,
  progress: SyncProgress | null,
  skyRunning: boolean,
): string {
  switch (status.kind) {
    case 'idle':
      if (progress !== null && progress.doneBytes >= progress.totalBytes) {
        return skyRunning ? 'Download complete' : 'Download complete. Starting the sky.';
      }
      return skyRunning ? 'No update running' : 'Waiting for the download';
    case 'syncing':
      return progress === null ? 'Starting the download' : 'Downloading data';
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
