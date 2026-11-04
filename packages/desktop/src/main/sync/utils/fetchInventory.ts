import type { OfflineInventory } from '../../../../../../tools/deploy/@types/OfflineInventory';

/** The published inventory, as text (kept verbatim on disk) and parsed; null when offline or not OK. */
export async function fetchInventory(
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
