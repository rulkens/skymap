import type { FetchedInventory } from '../@types/FetchedInventory';
import type { SyncOutcome } from '../@types/SyncOutcome';
import type { OfflineInventory } from '../../../../../../tools/deploy/@types/OfflineInventory';
import { OFFLINE_INVENTORY_KEY } from '../../../../../../tools/deploy/data/offlineInventoryKey';
import { INVENTORY_TIMEOUT_MS } from '../data/inventoryTimeoutMs';

/** The published inventory, or why there is none: unreachable is offline, an error answer failed. */
export async function fetchInventory(baseUrl: string): Promise<FetchedInventory | SyncOutcome> {
  let text: string;
  try {
    const res = await fetch(`${baseUrl}/${OFFLINE_INVENTORY_KEY}`, {
      signal: AbortSignal.timeout(INVENTORY_TIMEOUT_MS),
    });
    if (!res.ok) return { kind: 'failed' };
    text = await res.text();
  } catch {
    return { kind: 'offline' };
  }
  try {
    return { text, inventory: JSON.parse(text) as OfflineInventory };
  } catch {
    return { kind: 'failed' };
  }
}
