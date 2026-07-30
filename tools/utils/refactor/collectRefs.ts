/**
 * collectRefs — walk every reference to a resolved symbol and classify each one,
 * producing the structured blast-radius report the `refs` subcommand prints and
 * every mutating subcommand reuses for its `--dry` preview.
 *
 * ## Why classification, not a raw location list
 *
 * A bare list of file:line:col tells an operator WHERE the symbol is used but not
 * WHAT the edit will disturb. A rename has to touch imports, call sites, type
 * annotations, and re-exports differently; a delete is only safe when nothing
 * references the symbol at all. So each reference carries a `RefKind` — the
 * category that decides how a downstream mutation treats it — and its nearest
 * named enclosing declaration, so the report reads as 'this call inside
 * frameTick', not 'line 88'.
 *
 * ## The kind union is closed, and `test` wins
 *
 * `RefKind` is deliberately a fixed five-member union — inventing a new bucket per
 * odd reference shape would make the report un-summarisable. References fall into
 * exactly one kind by this precedence:
 *
 *   1. anything in a file under `tests/`         → 'test'
 *   2. an import specifier / clause              → 'import'
 *   3. an `export ... from` / `export {}` member → 're-export'
 *   4. a type-position use (type annotation etc.) → 'type-position'
 *   5. everything else (value reads AND call callees) → 'call'
 *
 * `test` is checked FIRST and wins over the finer kinds, which is what makes
 * `testCount` a one-line `filter` rather than a second classification pass — the
 * test/non-test split is the axis mutations care about most (a test referrer is
 * updated, never a reason to block a delete).
 *
 * Rule 5 is the documented value-use bucket: a plain value read that is neither an
 * import, a re-export, nor a type is grouped with call callees under 'call'. We do
 * NOT add a sixth 'value' kind — the union stays closed, and 'call' is the closest
 * existing bucket for 'this identifier is used as a runtime value here'. Whether
 * the reference is literally the callee of a `CallExpression` or a bare value read
 * is a distinction no downstream mutation acts on, so it isn't reified.
 *
 * ## Excluding the declaration itself
 *
 * ts-morph's `findReferencesAsNodes()` includes the symbol's own declaration name
 * among the results. That is not a reference to update — it is the thing being
 * pointed at — so it is filtered out by identity of its source position. Every
 * entry in `refs` is therefore a genuine USE elsewhere in the graph.
 *
 * The `RefKind` / `RefEntry` / `RefReport` types are co-located with this
 * function (the `applyMoves.ts` -> `MovePair` pattern): they only mean anything as
 * this collector's output.
 */

import { Node, SyntaxKind } from 'ts-morph';
import type { Project } from 'ts-morph';
import type { ResolvedSymbol } from './resolveSymbol';

export type RefKind = 'import' | 'call' | 'type-position' | 're-export' | 'test';

export type RefEntry = {
  readonly filePath: string;
  readonly line: number;
  readonly column: number;
  readonly kind: RefKind;
  readonly enclosing: string; // e.g. 'function frameTick' or '<module>'
};

export type RefReport = {
  readonly target: string; // the '<file>#<symbol>' address
  readonly refs: readonly RefEntry[]; // every reference except the declaration itself
  readonly fileCount: number; // distinct files in refs
  readonly testCount: number; // refs whose filePath is under tests/
};

export function collectRefs(project: Project, resolved: ResolvedSymbol): RefReport {
  void project; // resolution already bound the declaration to this project's graph.
  const { declaration, sourceFile, name } = resolved;
  const target = `${repoRelative(sourceFile.getFilePath())}#${name}`;

  if (!Node.isReferenceFindable(declaration)) {
    return { target, refs: [], fileCount: 0, testCount: 0 };
  }

  const declNameNode = nameNodeOf(declaration);
  const refs: RefEntry[] = [];
  for (const refNode of declaration.findReferencesAsNodes()) {
    if (isDeclarationSite(refNode, declNameNode)) continue;

    const refSource = refNode.getSourceFile();
    const absolutePath = refSource.getFilePath();
    const { line, column } = refSource.getLineAndColumnAtPos(refNode.getStart());
    refs.push({
      filePath: repoRelative(absolutePath),
      line,
      column,
      kind: classify(refNode, absolutePath),
      enclosing: enclosingLabel(refNode),
    });
  }

  const fileCount = new Set(refs.map((entry) => entry.filePath)).size;
  const testCount = refs.filter((entry) => entry.kind === 'test').length;
  return { target, refs, fileCount, testCount };
}

// The `test` kind is checked first and wins: a referrer under tests/ is always a
// test, whatever syntactic shape the reference takes there.
function classify(refNode: Node, absolutePath: string): RefKind {
  if (isUnderTests(absolutePath)) return 'test';
  if (isImportRef(refNode)) return 'import';
  if (isReExportRef(refNode)) return 're-export';
  if (isTypePositionRef(refNode)) return 'type-position';
  return 'call';
}

function isUnderTests(absolutePath: string): boolean {
  return absolutePath.includes('/tests/');
}

function isImportRef(refNode: Node): boolean {
  return refNode.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) !== undefined;
}

// `export { x } from './x'` and a bare `export { x }` are both ExportDeclarations;
// a value used inside an `export const y = x` is a VariableStatement, NOT one, so
// it correctly falls through to 'call' rather than being mistaken for a re-export.
function isReExportRef(refNode: Node): boolean {
  return refNode.getFirstAncestorByKind(SyntaxKind.ExportDeclaration) !== undefined;
}

// A reference in a type annotation sits directly under a TypeReference (or a
// QualifiedName within one, for `Ns.Member` type paths). Type nodes never appear
// in value positions, so this ancestor test is unambiguous.
function isTypePositionRef(refNode: Node): boolean {
  const parent = refNode.getParent();
  if (parent === undefined) return false;
  if (Node.isTypeReference(parent)) return true;
  return (
    Node.isQualifiedName(parent) &&
    parent.getFirstAncestorByKind(SyntaxKind.TypeReference) !== undefined
  );
}

// Nearest named enclosing declaration, labelled by kind — '<module>' when the
// reference sits at top level (an import, a re-export, a top-level type alias).
function enclosingLabel(refNode: Node): string {
  const owner = refNode.getFirstAncestor(
    (ancestor) =>
      (Node.isFunctionDeclaration(ancestor) && ancestor.getName() !== undefined) ||
      Node.isMethodDeclaration(ancestor) ||
      Node.isConstructorDeclaration(ancestor) ||
      (Node.isClassDeclaration(ancestor) && ancestor.getName() !== undefined) ||
      Node.isVariableDeclaration(ancestor),
  );
  if (owner === undefined) return '<module>';
  if (Node.isFunctionDeclaration(owner)) return `function ${owner.getName()}`;
  if (Node.isMethodDeclaration(owner)) return `method ${owner.getName()}`;
  if (Node.isConstructorDeclaration(owner)) return 'constructor';
  if (Node.isClassDeclaration(owner)) return `class ${owner.getName()}`;
  if (Node.isVariableDeclaration(owner)) return `variable ${owner.getName()}`;
  return '<module>';
}

// The declaration's own name node is returned among the references; skip it by
// matching source file + start position (identity of the wrapped node is not
// guaranteed across ts-morph's reference walk).
function isDeclarationSite(refNode: Node, declNameNode: Node | undefined): boolean {
  if (declNameNode === undefined) return false;
  return (
    refNode.getSourceFile().getFilePath() === declNameNode.getSourceFile().getFilePath() &&
    refNode.getStart() === declNameNode.getStart()
  );
}

function nameNodeOf(declaration: Node): Node | undefined {
  const maybeNamed = declaration as { getNameNode?: () => Node | undefined };
  return typeof maybeNamed.getNameNode === 'function' ? maybeNamed.getNameNode() : undefined;
}

// Repo-relative path for readable output; falls back to the raw path when the
// file lives outside the cwd (as in-memory test fixtures at '/src/...' do), so a
// synthetic Project still renders a stable, non-'../../' address.
function repoRelative(absolutePath: string): string {
  const relative = relativeFromCwd(absolutePath);
  return relative.startsWith('..') ? absolutePath : relative;
}

function relativeFromCwd(absolutePath: string): string {
  const cwd = process.cwd();
  if (absolutePath.startsWith(`${cwd}/`)) return absolutePath.slice(cwd.length + 1);
  return absolutePath;
}
