/**
 * planRename: repo-wide rename of one exported symbol and, by default, the file that
 * carries it, as a plan; nothing is written here.
 *
 * Under the one-symbol-per-file rule the file rename is the same edit at the filesystem
 * layer, so it defaults on (`--no-file-rename` opts out). A file whose basename isn't the
 * symbol was never named after it, and stays. Companions (test mirror, stylesheet) travel
 * with it through `expandCompanions`, with `exists` as the oracle.
 */

import { extname, posix, relative, resolve } from 'node:path';
import type { MovePair } from '../../../packages/move-files/src/@types/MovePair';
import { expandCompanions } from '../../../packages/move-files/src/expandCompanions';
import type { Engine } from '../../@types/refactor/Engine';
import type { PlanResult } from '../../@types/refactor/PlanResult';
import type { SymbolAddress } from '../../@types/refactor/SymbolAddress';
import { companionRules } from './companionRules';
import { findReferences } from './engine/findReferences';
import { locateExport } from './locateExport';
import { renameEdit } from './renameEdit';

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export function planRename(input: {
  address: SymbolAddress;
  newName: string;
  renameFile: boolean;
  engine: Engine;
  read: (file: string) => string;
  exists: (file: string) => boolean;
}): PlanResult {
  const { address, newName, engine, read } = input;
  if (!IDENTIFIER.test(newName)) {
    return refuse(`Cannot rename to '${newName}': it is not a valid identifier.`);
  }
  if (newName === address.symbol) {
    return refuse(`Cannot rename '${address.symbol}': the new name is the same.`);
  }
  const file = resolve(engine.root, address.file);
  const located = locateExport(read(file), address);
  if (!located.ok) return refuse(located.refusal);

  const at = { ...located.at, file };
  // The engine also returns the uses of an alias (`foo as bar`), which keep their name.
  const edits = findReferences(engine, at)
    .filter((ref) => read(ref.file).slice(ref.start, ref.end) === address.symbol)
    .map((ref) => renameEdit(read(ref.file), ref, newName));
  const moves = input.renameFile ? fileMoves(input, file, newName) : [];
  return { ok: true, plan: { edits, moves, deletes: [], findings: [] } };
}

function refuse(message: string): PlanResult {
  return { ok: false, refusals: [message] };
}

// The absolute moves (file + companions), or none when the basename doesn't track the symbol.
function fileMoves(
  input: { address: SymbolAddress; engine: Engine; exists: (file: string) => boolean },
  file: string,
  newName: string,
): MovePair[] {
  const { root } = input.engine;
  const rel = relative(root, file);
  // `extname` sees only the last dot, and would leave a declaration file's basename as `Foo.d`.
  const ext = rel.endsWith('.d.ts') ? '.d.ts' : extname(rel);
  if (posix.basename(rel, ext) !== input.address.symbol) return [];
  const moves = expandCompanions(
    [{ from: rel, to: posix.join(posix.dirname(rel), newName + ext) }],
    companionRules,
    (path) => input.exists(resolve(root, path)),
  );
  return moves.map(({ from, to }) => ({ from: resolve(root, from), to: resolve(root, to) }));
}
