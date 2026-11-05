import type { ControlStatus } from '../../../@types/ControlStatus';
import type { StatusView } from '../@types/StatusView';
import type { SyncState } from '../@types/SyncState';
import { formatClockTime } from '../utils/formatClockTime';
import { formatGigabytes } from '../utils/formatGigabytes';
import { FAILURE_TEXT } from './failureText';

const lastTried = ({ lastAttempt }: SyncState): string =>
  lastAttempt === null ? '' : ` Last tried at ${formatClockTime(lastAttempt)}.`;

/** Each status's words. Without saved data the sky cannot start, so those cases are a problem with Retry. */
export const STATUS_VIEW: {
  [K in ControlStatus['kind']]: (
    status: Extract<ControlStatus, { kind: K }>,
    sync: SyncState,
  ) => StatusView;
} = {
  idle: (_, { skyRunning, hasData }) => ({
    text: skyRunning
      ? 'No update running'
      : hasData
        ? 'Starting the sky'
        : 'Waiting for the download',
    tone: 'plain',
  }),
  syncing: (_, { progress }) => ({
    text: progress === null ? 'Starting the download' : 'Downloading data',
    tone: 'plain',
  }),
  paused: (_, { hasData }) => ({
    text: hasData ? 'Update paused. The sky uses the saved data.' : 'Download paused',
    tone: 'plain',
  }),
  complete: (_, { skyRunning }) => ({
    text: skyRunning ? 'Data up to date' : 'Download complete. Starting the sky.',
    tone: 'done',
  }),
  ready: () => ({ text: 'New data ready · Restart sky', tone: 'plain' }),
  offline: (_, sync) =>
    sync.hasData
      ? { text: 'No connection. The sky uses the saved data.', tone: 'plain' }
      : {
          text: `Skymap needs the internet once to download its data.${lastTried(sync)}`,
          tone: 'problem',
        },
  failed: ({ failure }, sync) => {
    const detail = failure.key === null ? failure.detail : `${failure.key}: ${failure.detail}`;
    if (sync.hasData) {
      return { text: 'The update stopped. The sky uses the saved data.', tone: 'plain', detail };
    }
    return { text: `${FAILURE_TEXT[failure.reason]}${lastTried(sync)}`, tone: 'problem', detail };
  },
  diskFull: ({ neededBytes, freeBytes }, sync) => ({
    text: `Not enough disk space: needs ${formatGigabytes(neededBytes)}, ${formatGigabytes(freeBytes)} free. Free some space, then retry.${lastTried(sync)}`,
    tone: 'problem',
  }),
};
