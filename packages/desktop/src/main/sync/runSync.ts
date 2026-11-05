import { mkdir, readFile, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import type { SyncedRecord } from './@types/SyncedRecord';
import type { SyncOutcome } from './@types/SyncOutcome';
import type { SyncRequest } from './@types/SyncRequest';
import { CONCURRENT_DOWNLOADS } from './data/concurrentDownloads';
import { INVENTORY_FILE } from './data/inventoryFile';
import { PROGRESS_INTERVAL_MS } from './data/progressIntervalMs';
import { SYNCED_FILE } from './data/syncedFile';
import { downloadWithRetries } from './utils/downloadWithRetries';
import { fetchInventory } from './utils/fetchInventory';
import { keyToLocalPath } from './utils/keyToLocalPath';
import { listMirrorKeys } from './utils/listMirrorKeys';
import { runPool } from './utils/runPool';
import { readJsonFile } from '../files/utils/readJsonFile';
import { writeFileAtomically } from '../files/utils/writeFileAtomically';
import { planSync } from './planSync';

/**
 * Downloads what the inventory lists and the mirror lacks, group by group. Never deletes:
 * inventory.json is written last, so a failed or paused run leaves the previous complete set intact
 * and the next run resumes from synced.json.
 */
export async function runSync({
  baseUrl,
  dataRoot,
  signal,
  onProgress,
}: SyncRequest): Promise<SyncOutcome> {
  const fetched = await fetchInventory(baseUrl, signal);
  if (signal.aborted) return { kind: 'paused' };
  if ('kind' in fetched) return fetched;

  await mkdir(dataRoot, { recursive: true });
  const syncedPath = join(dataRoot, SYNCED_FILE);
  const inventoryPath = join(dataRoot, INVENTORY_FILE);
  const synced = (await readJsonFile<SyncedRecord>(syncedPath)) ?? {};
  const plan = planSync(fetched.inventory, synced, await listMirrorKeys(dataRoot));
  const stored = await readFile(inventoryPath, 'utf8').catch(() => null);
  if (stored === fetched.text && plan.groups.every((g) => g.download.length === 0)) {
    return { kind: 'unchanged' };
  }

  const { bavail, bsize } = await statfs(dataRoot);
  if (plan.downloadBytes > bavail * bsize) {
    return { kind: 'diskFull', neededBytes: plan.downloadBytes, freeBytes: bavail * bsize };
  }

  let doneBytes = 0;
  let reportedAt = 0;
  const report = (always: boolean): void => {
    const now = Date.now();
    if (!always && now - reportedAt < PROGRESS_INTERVAL_MS) return;
    reportedAt = now;
    onProgress({ doneBytes, totalBytes: plan.downloadBytes });
  };
  report(true);
  try {
    for (const { download } of plan.groups) {
      try {
        await runPool(download, CONCURRENT_DOWNLOADS, async (file) => {
          const url = `${baseUrl}/${file.key.split('/').map(encodeURIComponent).join('/')}`;
          await downloadWithRetries(
            url,
            keyToLocalPath(dataRoot, file.key),
            file.sha256,
            signal,
            (n) => {
              doneBytes += n;
              report(false);
            },
          );
          synced[file.key] = file.sha256;
        });
      } finally {
        await writeFileAtomically(syncedPath, JSON.stringify(synced));
      }
    }
  } catch {
    return { kind: signal.aborted ? 'paused' : 'failed' };
  } finally {
    report(true);
  }
  await writeFileAtomically(inventoryPath, fetched.text);
  return { kind: 'synced' };
}
