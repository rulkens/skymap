/**
 * SlotStore — what the tile stream needs from a fixed-capacity, key-addressed
 * slot store: claim / refresh / resolve a key's slot, count residents, and
 * hear about evictions. `SlotPool` is the bookkeeping; `TextureAtlas`
 * composes one and adds the GPU side.
 */

import type { SlotEvictHandler } from './SlotEvictHandler';

export type SlotStore = {
  allocate(key: string, frame: number): number | null;
  touch(key: string, frame: number): number | null;
  slotOf(key: string): number | undefined;
  occupiedCount(): number;
  setEvictHandler(handler: SlotEvictHandler | undefined): void;
  /** Free whatever backs the slots; the stream that owns the store calls it. */
  destroy(): void;
};
