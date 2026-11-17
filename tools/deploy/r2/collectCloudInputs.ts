import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { R2Upload } from '../@types/R2Upload';
import { CLOUD_INPUT_KEYS } from '../../utils/io/CLOUD_INPUT_KEYS';
import { RAW_DATA } from '../../utils/io/rawDataRegistry';

/** The cloud bake inputs present under `repoRoot`, keyed by their registry path so the mirror's
 * URL is `<data base URL>/<registry path>` (what `fetch-cloud-inputs` reads). */
export function collectCloudInputs(repoRoot: string): R2Upload[] {
  return CLOUD_INPUT_KEYS.map((key) => RAW_DATA[key].path)
    .filter((path) => existsSync(join(repoRoot, path)))
    .map((path) => ({ localPath: join(repoRoot, path), r2Key: path }));
}
