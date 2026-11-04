import type { FetchedInventory } from '../@types/FetchedInventory';
import type { OfflineInventory } from '../../../../../../tools/deploy/@types/OfflineInventory';
import { OFFLINE_INVENTORY_KEY } from '../../../../../../tools/deploy/data/offlineInventoryKey';
import { INVENTORY_TIMEOUT_MS } from '../data/inventoryTimeoutMs';

/** The published inventory; null when offline or not OK. */
export async function fetchInventory(baseUrl: string): Promise<FetchedInventory | null> {
  try {
    const res = await fetch(`${baseUrl}/${OFFLINE_INVENTORY_KEY}`, {
      signal: AbortSignal.timeout(INVENTORY_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return { text, inventory: JSON.parse(text) as OfflineInventory };
  } catch {
    return null;
  }
}
