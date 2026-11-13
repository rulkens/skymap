/** Every nightly live dataset. The workflow matrix and the app's pointer reads both start here. */
import type { LiveDataset } from '../../@types/live/LiveDataset';

export const LIVE_DATASETS: readonly LiveDataset[] = [
  {
    id: 'satellites',
    build: 'live-satellites',
    files: [{ name: 'satellites.satg', contentType: 'application/octet-stream', gzip: true }],
    timeoutMin: 20,
  },
];
