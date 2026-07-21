/**
 * planDelete — remove one exported symbol (and, when it was the file's only
 * export, the file plus its test mirror) from the shared ts-morph `Project`,
 * but only after proving nothing points at it.
 *
 * ## Why any reference refuses the delete — imports, calls, types, re-exports,
 * tests alike
 *
 * A delete is the one refactor with no safe partial application: rewrite an
 * importer and it still compiles under the new name; drop a declaration out from
 * under a live reference and the graph is broken. So the contract is the strict
 * one — if `collectRefs` finds ANY reference of ANY kind, the delete refuses and
 * throws, with the classified reference list (the same reporter the `refs`
 * subcommand and the `--dry` previews use) in the message so the operator sees
 * exactly which files to unpick. Tests count as references here too: unlike a
 * rename (where a test referrer is mechanically updated), a delete that would
 * leave a test importing a vanished symbol is not something to paper over.
 *
 * Re-exports are references like any other, deliberately with NO repair branch.
 * The tempting shortcut — 'a re-export is just plumbing, rewrite the barrel and
 * delete anyway' — is a whole second code path that has to reason about whether
 * the barrel is itself referenced, whether other names ride the same
 * `export {} from` clause, and so on. In a no-barrel repo (CLAUDE.md forbids
 * barrels; re-exports are near-nonexistent) that path would exist to handle a
 * case that essentially never arises. So the rare re-export is refused like
 * everything else: the operator hand-removes the one line and re-runs. One code
 * path, no branch that only a synthetic fixture ever exercises.
 *
 * ## Why the file (and its mirror) go when the symbol was the file's only export
 *
 * Under the house one-symbol-per-file rule, deleting the sole export of
 * `src/utils/x/foo.ts` leaves a file that advertises `foo` in its name and
 * exports nothing — a husk the conventions forbid. So when the target was the
 * file's only exported declaration and no meaningful top-level statement survives
 * its removal, the whole file is dropped, and its `tests/` mirror with it (the
 * mirror exists because the source does; orphaning it rots the parallel tree).
 * Mirror derivation reuses `expandTestMirrors` and the Project as the existence
 * oracle, exactly as `planRename` does — one definition of the mirror convention,
 * not two that can drift. A multi-export file keeps its remaining exports; only
 * the one declaration is removed.
 *
 * ## Mutate-only, validate-first
 *
 * The reference check runs BEFORE any mutation, and the planner never saves — the
 * CLI driver owns the single tail `project.save()` (skipped under `--dry`), so a
 * refusal aborts with the tree untouched and disk never partially written.
 */

import { Node } from 'ts-morph';
import type { Project } from 'ts-morph';
import { collectRefs } from './collectRefs';
import type { RefReport } from './collectRefs';
import { hasMeaningfulStatements } from './hasMeaningfulStatements';
import { removeFileWithMirror } from './removeFileWithMirror';
import { renderRefReport } from './renderRefReport';
import type { ResolvedSymbol } from './resolveSymbol';

export function planDelete(project: Project, resolved: ResolvedSymbol): void {
  // Validate first: any reference of any kind blocks the delete, and the throw
  // carries the classified list so the operator knows what to remove.
  const report = collectRefs(project, resolved);
  if (report.refs.length > 0) {
    throw new Error(refusalMessage(report));
  }

  const { sourceFile, declaration } = resolved;
  // Whether this was a one-symbol file is read BEFORE removal — afterwards the
  // export map no longer names the thing we're deleting.
  const wasOnlyExport = sourceFile.getExportedDeclarations().size === 1;

  removeDeclaration(declaration);

  // Drop the whole file only when it was the sole export AND nothing meaningful
  // (a non-import top-level statement) is left behind — otherwise a stray helper
  // or side-effect statement would be silently deleted with it.
  if (wasOnlyExport && !hasMeaningfulStatements(sourceFile)) {
    removeFileWithMirror(project, sourceFile);
  }
}

// The reference list, refusal header, and re-run hint. `renderRefReport(_, false)`
// is the human table the `refs` subcommand prints; its rows name every
// referencing file:line:col, which is what makes the refusal actionable.
function refusalMessage(report: RefReport): string {
  return [
    `Cannot delete '${report.target}': ${report.refs.length} reference(s) still point to it. ` +
      `Remove them first, then re-run:`,
    renderRefReport(report, false),
  ].join('\n');
}

// ExportedDeclarations is a union of node kinds that all carry `.remove()`
// (VariableDeclaration, FunctionDeclaration, ClassDeclaration, InterfaceDeclaration,
// TypeAliasDeclaration, EnumDeclaration, …). Guard on the method so an exotic
// exported-expression form fails visibly rather than silently no-op'ing.
function removeDeclaration(declaration: Node): void {
  const removable = declaration as Node & { remove?: () => void };
  if (typeof removable.remove !== 'function') {
    throw new Error(
      `Cannot delete: its declaration (${declaration.getKindName()}) has no removable form.`,
    );
  }
  removable.remove();
}
