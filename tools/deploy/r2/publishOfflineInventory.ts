import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { R2SyncGroup } from '../@types/R2SyncGroup';
import { OFFLINE_INVENTORY_KEY } from '../data/offlineInventoryKey';
import { buildOfflineInventory } from './buildOfflineInventory';
import { uploadViaWrangler } from './uploadViaWrangler';

/** Uploads after the data manifest (the last group); returns the refusal message, or null on success. */
export function publishOfflineInventory(
  groups: readonly R2SyncGroup[],
  touchedKeys: string[],
  bucket: string,
  cacheControl: string,
): string | null {
  let inventory;
  try {
    inventory = buildOfflineInventory(groups);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  const dir = mkdtempSync(join(tmpdir(), 'skymap-offline-inventory-'));
  try {
    const localPath = join(dir, 'offline-inventory.json');
    writeFileSync(localPath, JSON.stringify(inventory));
    uploadViaWrangler({ localPath, r2Key: OFFLINE_INVENTORY_KEY }, bucket, cacheControl, false);
    touchedKeys.push(OFFLINE_INVENTORY_KEY);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return null;
}
