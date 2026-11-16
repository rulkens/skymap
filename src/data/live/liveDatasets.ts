/** Every nightly live dataset: the workflow matrix reads this; the app hard-codes the ids and file names it fetches. */
import type { LiveDataset } from '../../@types/live/LiveDataset';
import { bodyTextureFilename } from '../../utils/bodyTextures/bodyTextureFilename';
import { TIER_LADDER } from '../tierLadder';

export const LIVE_DATASETS: readonly LiveDataset[] = [
  {
    id: 'satellites',
    build: 'live-satellites',
    files: [{ name: 'satellites.satg', contentType: 'application/octet-stream', gzip: true }],
    timeoutMin: 20,
  },
  {
    id: 'clouds',
    build: 'build-live-clouds',
    // The built-in tiers' names, so the clouds slot finds the daily file by the name it already asks for.
    files: TIER_LADDER.map((tier) => ({
      name: bodyTextureFilename('earth', 'clouds', tier),
      contentType: 'image/webp',
      gzip: false,
    })),
    timeoutMin: 45,
    cache: { paths: ['data/raw/textures'], key: 'data/raw/textures/textures.sha256' },
    setupRust: true,
    bodyTexture: { bodyId: 'earth', kind: 'clouds' },
  },
];
