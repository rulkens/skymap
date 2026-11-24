/**
 * planRename: repo-wide rename of one exported symbol and, by default, the file that
 * carries it, as a plan; nothing is written here.
 *
 * Under the one-symbol-per-file rule the file rename is the same edit at the filesystem
 * layer, so it defaults on (`--no-file-rename` opts out). A file whose basename isn't the
 * symbol was never named after it, and stays. Companions (test mirror, stylesheet) travel
 * with it through `companionPaths`, with `exists` as the oracle.
 */

import { extname, posix, relative } from 'node:path';
import type { FoundRefs } from '../../@types/refactor/FoundRefs';
import type { PlanResult } from '../../@types/refactor/PlanResult';
import type { SymbolAddress } from '../../@types/refactor/SymbolAddress';
import { companionPaths } from './companionPaths';
import { isAliasBinding } from './isAliasBinding';
import { renameEdit } from './renameEdit';

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export function planRename(input: {
  address: SymbolAddress;
  found: FoundRefs;
  newName: string;
  renameFile: boolean;
  root: string;
  read: (file: string) => string;
  exists: (file: string) => boolean;
}): PlanResult {
  const { address, found, newName, read } = input;
  if (!IDENTIFIER.test(newName)) {
    return refuse(`Cannot rename to '${newName}': it is not a valid identifier.`);
  }
  if (newName === address.symbol) {
    return refuse(`Cannot rename '${address.symbol}': the new name is the same.`);
  }

  // The engine also returns an alias's own name and uses (`bar` of `foo as bar`), which are
  // other symbols; a use of one is told apart by its spelling.
  const mine = found.refs.filter(
    (ref) =>
      read(ref.file).slice(ref.start, ref.end) === address.symbol &&
      !isAliasBinding(read(ref.file), ref),
  );
  const edits = [found.at, ...mine].map((ref) => renameEdit(read(ref.file), ref, newName));
  return { ok: true, plan: { edits, moves: fileMoves(input), deletes: [], findings: [] } };
}

function refuse(message: string): PlanResult {
  return { ok: false, refusals: [message] };
}

// The absolute moves (file + companions), or none when the basename doesn't track the symbol.
function fileMoves(input: Parameters<typeof planRename>[0]) {
  const file = input.found.at.file;
  const rel = relative(input.root, file);
  // `extname` sees only the last dot, and would leave a declaration file's basename as `Foo.d`.
  const ext = rel.endsWith('.d.ts') ? '.d.ts' : extname(rel);
  if (!input.renameFile || posix.basename(rel, ext) !== input.address.symbol) return [];
  const to = posix.join(posix.dirname(file), input.newName + ext);
  return companionPaths({ root: input.root, from: file, to, exists: input.exists });
}
