/**
 * planRename — repo-wide rename of one exported symbol, and (by default) the
 * file that carries it, against the shared ts-morph `Project`.
 *
 * ## Why the file rename rides along, and why it's the DEFAULT with an opt-out
 *
 * Skymap's house rule is one exported symbol per file with the filename equal to
 * the export name (CLAUDE.md: `utils/` and `@types/` are one-symbol-per-file,
 * filename = the exported symbol's name). Under that rule, renaming `clamp` in
 * `src/utils/math/clamp.ts` and leaving the file called `clamp.ts` breaks the
 * convention the moment the identifier changes — the file now advertises a name
 * nothing inside it exports. So the file rename is not an afterthought bolted on
 * to the identifier rename; it is the SAME edit expressed at the filesystem
 * layer, and doing only half of it leaves the tree in a state the conventions
 * forbid. That is why `renameFile` defaults on at the CLI (`--no-file-rename` is
 * the opt-out, never an opt-in): the common case is a convention-abiding file
 * whose name tracks its symbol, and the rename should keep that invariant true.
 *
 * The opt-out exists for the files the rule does NOT cover — a multi-export
 * `tools/` helper, a component whose file name is a PascalCase concept rather
 * than the exact export, anything where the basename deliberately does not equal
 * the symbol. There we detect the mismatch structurally (basename ≠ old symbol
 * name) and leave the file alone even when `renameFile` is true, so a rename
 * never renames a file that was never named after the symbol in the first place.
 *
 * ## Why the test mirror is dragged, and why we reuse expandTestMirrors
 *
 * Tests live in a parallel `tests/` tree that mirrors the source path with a
 * `.test` suffix. Rename the source file without its mirror and the mirror rots
 * (its name no longer matches the file under test). The src→tests derivation and
 * the `.test.ts` / `.test.tsx` suffix probing already live in `expandTestMirrors`
 * (and the import rewriting in `applyMoves`), so this planner reuses both rather
 * than re-deriving mirror paths — one definition of the mirror convention, not
 * two that can drift. The existence oracle is the Project itself: it spans
 * `src/ + tests/ + tools/` (see `loadRefactorProject`), so a mirror the graph
 * knows about is dragged whether the Project is the real repo or an in-memory
 * fixture, with no filesystem probe that a synthetic Project could not satisfy.
 *
 * ## Mutate-only, validate-first
 *
 * The planner mutates the in-memory Project and never saves — the CLI driver owns
 * the single tail `project.save()` (or skips it under `--dry`), so all-or-nothing
 * batching falls out structurally. Resolution + ambiguity checks already happened
 * in `resolveSymbol`; the one remaining pre-flight is that the declaration is
 * actually renameable, checked BEFORE any mutation so an un-renameable target
 * (an exported expression, a re-exported `SourceFile`) fails loudly without
 * leaving a half-renamed tree.
 */

import { dirname, extname } from 'node:path';
import { Node } from 'ts-morph';
import type { Project } from 'ts-morph';
import type { MovePair } from './applyMoves';
import { applyMoves } from './applyMoves';
import { anchorToMirroredRoot } from './anchorToMirroredRoot';
import { expandTestMirrors } from './expandTestMirrors';
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

  // Capture the file rename BEFORE mutating: the basename tracks the OLD symbol
  // name, so the filename-matches-symbol test must read the pre-rename path.
  const fileMoves = renameFile ? planFileRename(project, resolved, newName) : [];

  // Identifier rename first (the language-service rewrite of every reference),
  // then the file move (ts-morph rewrites the importers' relative paths). The
  // two edits are independent — node identity survives a move — so ordering only
  // matters for keeping all validation ahead of all mutation, which it does.
  declaration.rename(newName);
  if (fileMoves.length > 0) applyMoves(project, fileMoves);
}

// Return the absolute move pairs (source file + any test mirror) for the file
// rename, or [] when the basename does not track the symbol name. Empty is the
// convention-not-covered case: rename the identifier, leave the file untouched.
function planFileRename(project: Project, resolved: ResolvedSymbol, newName: string): MovePair[] {
  const absSource = resolved.sourceFile.getFilePath();
  const anchor = anchorToMirroredRoot(absSource);
  if (anchor === null) return [];

  const { rel, prefix } = anchor;
  // `.d.ts` is ONE extension, but `extname` only ever sees the last dot and
  // returns `.ts` — leaving a declaration file's basename as `Foo.d`, which can
  // never equal its symbol. Every `src/@types/**` rename then silently skipped
  // its file move while the identifier rename reported success.
  const ext = rel.endsWith('.d.ts') ? '.d.ts' : extname(rel);
  const basename = rel.slice(dirname(rel).length + 1, rel.length - ext.length);
  if (basename !== resolved.name) return [];

  const relDest = `${dirname(rel)}/${newName}${ext}`;
  // expandTestMirrors appends the `.test.ts`/`.test.tsx` mirror move (if the
  // Project knows that file), keeping mirror derivation in one place.
  const relMoves = expandTestMirrors(
    [{ from: rel, to: relDest }],
    (relPath) => project.getSourceFile(prefix + relPath) !== undefined,
  );
  return relMoves.map(({ from, to }) => ({ from: prefix + from, to: prefix + to }));
}
