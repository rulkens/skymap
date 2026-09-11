/**
 * A harvest directory's STAC sidecars, filename-sorted — the order every bake
 * numbers its frames in. A missing directory reads as empty so the caller's
 * own "run fetch-skraafoto" hint fires instead of an ENOENT.
 */
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { SkraafotoStacItem } from '../../scene-recon/@types/SkraafotoStacItem';

export async function readStacItems(dir: string): Promise<SkraafotoStacItem[]> {
  if (!existsSync(dir)) return [];
  const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  return Promise.all(
    names.map(
      async (name) => JSON.parse(await readFile(join(dir, name), 'utf8')) as SkraafotoStacItem,
    ),
  );
}
