import type { PickCodeOwner } from './PickCodeOwner';

export type PickCodeAllocator = {
  /** Same (layer, id) → same code. Throws past 62 codes. */
  codeOf(layer: string, pickSourceId: string): number;
  /** The (layer, id) that owns `code`, or null; for the debug overlay and assertions. */
  ownerOf(code: number): PickCodeOwner | null;
};
