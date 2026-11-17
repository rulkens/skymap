/**
 * sceneBodyPick — a body's pick as the code of the seed table that holds it and its index there:
 * the code its body layer stamps (the caller's `codeOf`), so a caption picks what its body does.
 * Bodies only; `null` when no body table seeds the id (the Sun, a star, a typo).
 */

import { SOURCE_ENTRIES } from '../../data/sourceEntries';
import { BODY_PICK_ROWS } from '../../data/bodies/bodyPickRows';
import { seedIndexOfBody } from './seedIndexOfBody';
import type { BodySourceEntry } from '../../@types/data/body/BodySourceEntry';
import type { BodySourceId } from '../../@types/data/body/BodySourceId';

const BODY_ENTRIES = SOURCE_ENTRIES.filter((entry) => entry.type === 'body');

export function sceneBodyPick(
  id: string,
  codeOf: (entry: BodySourceEntry) => number,
): { readonly code: number; readonly index: number } | null {
  for (const entry of BODY_ENTRIES) {
    const index = seedIndexOfBody(id, BODY_PICK_ROWS[entry.id as BodySourceId]);
    if (index >= 0) return { code: codeOf(entry), index };
  }
  return null;
}
