import { existsSync } from 'node:fs';
import { mkdir, rename, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { OfflineInventory } from '../../../../tools/deploy/@types/OfflineInventory';
import type { SyncedRecord } from '../@types/SyncedRecord';
import type { SyncOutcome } from '../@types/SyncOutcome';
import type { SyncProgress } from '../@types/SyncProgress';
import { downloadVerified } from '../utils/downloadVerified';
import { keyToLocalPath } from '../utils/keyToLocalPath';
import { readJsonFile } from '../utils/readJsonFile';
import { runPool } from '../utils/runPool';
import { InsufficientDiskError } from './InsufficientDiskError';
import { planSync } from './planSync';

const CONCURRENT_DOWNLOADS = 8;

async function writeJsonAtomically(path: string, text: string): Promise<void> {
  await writeFile(`${path}.tmp`, text);
  await rename(`${path}.tmp`, path);
}

async function fetchInventory(
  baseUrl: string,
  timeoutMs: number,
): Promise<{ text: string; inventory: OfflineInventory } | null> {
  try {
    const res = await fetch(`${baseUrl}/data/offline-inventory.json`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return { text, inventory: JSON.parse(text) as OfflineInventory };
  } catch {
    return null;
  }
}

/**
 * Downloads what the inventory lists and the mirror lacks, group by group. Never deletes:
 * inventory.json is written last, so a failed run leaves the previous complete set intact and
 * the next run resumes from synced.json.
 */
export async function runSync(opts: {
  baseUrl: string;
  dataRoot: string;
  onProgress: (progress: SyncProgress) => void;
  inventoryTimeoutMs?: number;
}): Promise<SyncOutcome> {
  const { baseUrl, dataRoot, onProgress, inventoryTimeoutMs = 5000 } = opts;
  const fetched = await fetchInventory(baseUrl, inventoryTimeoutMs);
  if (fetched === null) return 'offline';

  await mkdir(dataRoot, { recursive: true });
  const syncedPath = join(dataRoot, 'synced.json');
  const synced = (await readJsonFile<SyncedRecord>(syncedPath)) ?? {};
  const onDisk = new Set(
    fetched.inventory.groups.flatMap((g) =>
      g.files.map((f) => f.key).filter((key) => existsSync(keyToLocalPath(dataRoot, key))),
    ),
  );
  const plan = planSync(fetched.inventory, synced, onDisk);

  const { bavail, bsize } = await statfs(dataRoot);
  if (plan.downloadBytes > bavail * bsize) {
    throw new InsufficientDiskError(plan.downloadBytes, bavail * bsize);
  }

  let doneBytes = 0;
  try {
    for (const { label, download } of plan.groups) {
      try {
        await runPool(download, CONCURRENT_DOWNLOADS, async (file) => {
          const url = `${baseUrl}/${file.key.split('/').map(encodeURIComponent).join('/')}`;
          await downloadVerified(url, keyToLocalPath(dataRoot, file.key), file.sha256, (n) => {
            doneBytes += n;
            onProgress({ doneBytes, totalBytes: plan.downloadBytes, group: label });
          });
          synced[file.key] = file.sha256;
        });
      } finally {
        await writeJsonAtomically(syncedPath, JSON.stringify(synced));
      }
    }
  } catch {
    return 'failed';
  }
  await writeJsonAtomically(join(dataRoot, 'inventory.json'), fetched.text);
  return 'synced';
}
