/**
 * createPickCodeAllocator — hands each Layer's pick sources a 6-bit code for the pick word.
 * Codes are per engine and per session: never persisted, never a catalog `Source` value.
 * `seed` pins ids to fixed codes (the legacy table, until codes go dense); unseeded ids take
 * the lowest free code from 1, skipping seeded ones. 63 is the all-ones sentinel and 0 is never
 * handed out (no `Source` value was ever 0), so codes run 1..62.
 */

import { SELECTION_SOURCE_SENTINEL_CODE } from '../../../data/selectionEncoding';
import type { PickCodeAllocator } from '../../../@types/engine/selection/PickCodeAllocator';

const MAX_PICK_CODES = SELECTION_SOURCE_SENTINEL_CODE - 1;

type Owner = { readonly layer: string; readonly pickSourceId: string };

export function createPickCodeAllocator(
  seed: Readonly<Record<string, Readonly<Record<string, number>>>> = {},
): PickCodeAllocator {
  const codeByKey = new Map<string, number>();
  const ownerByCode = new Map<number, Owner>();
  const keyOf = (layer: string, id: string): string => `${layer}\u0000${id}`;

  for (const [layer, ids] of Object.entries(seed)) {
    for (const [pickSourceId, code] of Object.entries(ids)) {
      codeByKey.set(keyOf(layer, pickSourceId), code);
      ownerByCode.set(code, { layer, pickSourceId });
    }
  }

  return {
    codeOf(layer, pickSourceId) {
      const key = keyOf(layer, pickSourceId);
      const known = codeByKey.get(key);
      if (known !== undefined) return known;
      let code = 1;
      while (ownerByCode.has(code)) code += 1;
      if (ownerByCode.size >= MAX_PICK_CODES) {
        throw new Error(
          `createPickCodeAllocator: no free pick code for ${layer}/${pickSourceId} (max ${MAX_PICK_CODES})`,
        );
      }
      codeByKey.set(key, code);
      ownerByCode.set(code, { layer, pickSourceId });
      return code;
    },
    ownerOf: (code) => ownerByCode.get(code) ?? null,
  };
}
