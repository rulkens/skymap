import { relative, resolve } from 'node:path';
import { expandCompanions } from '../../../packages/move-files/src/expandCompanions';
import type { MovePair } from '../../../packages/move-files/src/@types/MovePair';
import { companionRules } from './companionRules';

/**
 * `from` to `to` (absolute) plus each companion's own move: the test mirror, a stylesheet.
 * `exists` is the oracle for which companions are real; pass `to === from` to list a
 * file's companions for a delete.
 */
export function companionPaths(input: {
  root: string;
  from: string;
  to: string;
  exists: (file: string) => boolean;
}): MovePair[] {
  const { root } = input;
  const moves = expandCompanions(
    [{ from: relative(root, input.from), to: relative(root, input.to) }],
    companionRules,
    (path) => input.exists(resolve(root, path)),
  );
  return moves.map(({ from, to }) => ({ from: resolve(root, from), to: resolve(root, to) }));
}
