import type { OfflineInventory } from '../../../../../../tools/deploy/@types/OfflineInventory';

/** The published inventory as text (kept verbatim on disk) and parsed. */
export type FetchedInventory = { text: string; inventory: OfflineInventory };
