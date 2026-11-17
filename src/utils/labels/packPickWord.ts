/**
 * packPickWord — the pick word a label stamps for its subject: byte-identical to what the
 * subject's own geometry writes, so `resolvePick` needs no label arm. Never 0, which is "no hit".
 */

import { packSelection, PICK_SENTINEL_OFFSET } from '../../data/selectionEncoding';

export function packPickWord(code: number, index: number): number {
  return packSelection(code, index + PICK_SENTINEL_OFFSET);
}
