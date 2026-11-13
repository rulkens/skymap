/** Every nightly live dataset: the workflow matrix reads this; the app hard-codes the ids and file names it fetches. */
import type { LiveDataset } from '../../@types/live/LiveDataset';

export const LIVE_DATASETS: readonly LiveDataset[] = [
  {
    id: 'satellites',
    build: 'live-satellites',
    files: [{ name: 'satellites.satg', contentType: 'application/octet-stream', gzip: true }],
    timeoutMin: 20,
  },
];
