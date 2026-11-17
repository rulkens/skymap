/**
 * sceneBodyPickId — the packed word of `sceneBodyPick`, the twin of each body layer's `drawPick`
 * (same codes and seed tables). `null` means SKIP: an index packed from −1 would alias body 0.
 */

import { packPickWord } from '../../data/selectionEncoding';
import { sceneBodyPick } from './sceneBodyPick';
import type { BodySourceEntry } from '../../@types/data/body/BodySourceEntry';

export function sceneBodyPickId(
  id: string,
  codeOf: (entry: BodySourceEntry) => number,
): number | null {
  const pick = sceneBodyPick(id, codeOf);
  return pick === null ? null : packPickWord(pick.code, pick.index);
}
