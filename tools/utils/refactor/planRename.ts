/**
 * planRename: repo-wide rename of one exported symbol and, by default, the file
 * that carries it, against the shared ts-morph `Project`.
 *
 * Under the one-symbol-per-file rule the file rename is the same edit at the
 * filesystem layer, so it defaults on (`--no-file-rename` opts out). A file whose
 * basename isn't the symbol was never named after it, and is left alone. The test
 * mirror is dragged by `expandCompanions`, with the Project as the existence oracle.
 * The planner mutates the Project and never saves; the CLI owns the single save.
 */

import { extname, posix } from 'node:path';
import { Node } from 'ts-morph';
import type { Project } from 'ts-morph';
import type { MovePair } from '../../../packages/move-files/src/@types/MovePair';
import { applyMoves } from './applyMoves';
import { expandCompanions } from '../../../packages/move-files/src/expandCompanions';
import { companionRules } from './companionRules';
import type { ResolvedSymbol } from './resolveSymbol';

export function planRename(
  project: Project,
  resolved: ResolvedSymbol,
  newName: string,
  renameFile: boolean,
): void {
  const declaration = resolved.declaration;
  if (!Node.isRenameable(declaration)) {
    throw new Error(
      `Cannot rename '${resolved.name}': its declaration (${declaration.getKindName()}) is not a renameable node.`,
    );
  }

  // Before mutating: the basename tracks the OLD symbol name.
  const fileMoves = renameFile ? planFileRename(project, resolved, newName) : [];

  // Identifier first (the language service), then the file (the move-files engine rewrites
  // importers). Node identity survives a move, so only validation-before-mutation matters.
  declaration.rename(newName);
  if (fileMoves.length > 0) applyMoves(project, fileMoves);
}

// The absolute moves (file + any test mirror), or [] when the basename doesn't track the symbol.
function planFileRename(project: Project, resolved: ResolvedSymbol, newName: string): MovePair[] {
  const root = project.getFileSystem().getCurrentDirectory();
  const rel = posix.relative(root, resolved.sourceFile.getFilePath());
  // `extname` sees only the last dot, and would leave a declaration file's basename as `Foo.d`.
  const ext = rel.endsWith('.d.ts') ? '.d.ts' : extname(rel);
  if (posix.basename(rel, ext) !== resolved.name) return [];

  const relMoves = expandCompanions(
    [{ from: rel, to: posix.join(posix.dirname(rel), newName + ext) }],
    companionRules,
    (path) => project.getSourceFile(posix.resolve(root, path)) !== undefined,
  );
  return relMoves.map(({ from, to }) => ({
    from: posix.resolve(root, from),
    to: posix.resolve(root, to),
  }));
}
