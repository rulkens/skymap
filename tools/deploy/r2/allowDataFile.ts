/**
 * Which `public/data/` files are tracked: hashed by `buildDataManifest`, named
 * in `manifest.json`, and uploaded to R2 — the `wrangler` rows of `DATA_FAMILIES`.
 */
import { dataFamilyOf } from './dataFamilyOf';

export const allowDataFile = (path: string): boolean =>
  dataFamilyOf(path)?.transport === 'wrangler';
