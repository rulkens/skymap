/**
 * createPickCodeAllocator — hands each Layer's pick sources a 6-bit code for the pick word.
 * Codes are per engine and per session: never persisted, never a catalog `Source` value.
 * They run densely from 1 in first-ask order; 63 is the all-ones sentinel and 0 is never
 * handed out, so codes run 1..62.
 */

import { SELECTION_SOURCE_SENTINEL_CODE } from '../../../data/selectionEncoding';
import type { PickCodeAllocator } from '../../../@types/engine/selection/PickCodeAllocator';

const MAX_PICK_CODES = SELECTION_SOURCE_SENTINEL_CODE - 1;

export function createPickCodeAllocator(): PickCodeAllocator {
  const codeByKey = new Map<string, number>();
  const keyOf = (layer: string, id: string): string => `${layer}\u0000${id}`;

  return {
    codeOf(layer, pickSourceId) {
      const key = keyOf(layer, pickSourceId);
      const known = codeByKey.get(key);
      if (known !== undefined) return known;
      if (codeByKey.size >= MAX_PICK_CODES) {
        throw new Error(
          `createPickCodeAllocator: no free pick code for ${layer}/${pickSourceId} (max ${MAX_PICK_CODES})`,
        );
      }
      const code = codeByKey.size + 1;
      codeByKey.set(key, code);
      return code;
    },
    codeIfAsked: (layer, pickSourceId) => codeByKey.get(keyOf(layer, pickSourceId)) ?? null,
  };
}
