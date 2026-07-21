/**
 * planExtract — lift one exported symbol out of a crowded file into its own
 * `dest`, dragging the file-local helpers that belong to it, repointing everyone
 * who imported it, and leaving the source file compiling. This is the `extract`
 * subcommand (Q4 of the design record) and the widest-reaching mutation in the CLI.
 *
 * ## Option B: exclusive deps travel, shared deps BLOCK
 *
 * `classifyLocalDeps` splits the target's transitive closure over the file's
 * unexported locals into `exclusive` (reached only through the moving cohort) and
 * `shared` (also touched by code that stays). Option B moves the exclusive helpers
 * out WITH the target and refuses the whole extraction the moment any dep is
 * shared, naming each one. A shared local is a concern hiding inside one file:
 * moving it would orphan the stayers' references, copying it would fork one
 * definition into two that drift. Neither is a mechanical call a tool should make,
 * so the honest resolution is to give that helper its own file first and re-run —
 * and the refusal says exactly which helpers need that. The block is a design
 * signal, not a limitation to smooth over.
 *
 * ## Why dragged deps stay unexported, and only the target is exported in dest
 *
 * The target keeps its exported form (external code names it; it must stay
 * addressable, now from `dest`). The dragged exclusive deps were file-local before
 * the move and stay file-local after: by the definition of `exclusive`, nothing
 * outside the cohort ever referenced them, so nothing needs them exported. Adding
 * an `export` would advertise a helper no one imports and violate the house
 * one-public-symbol-per-file spirit, so the cohort's texts move verbatim — the
 * target carries its `export`, the helpers carry none.
 *
 * ## Validate first, mutate never-partially
 *
 * Both refusals (dest already exists; a shared dep) are checked BEFORE a single
 * node moves, so a rejected extraction leaves the source file byte-for-byte
 * unchanged. Everything the mutation needs — the cohort's texts, which imports it
 * uses, the list of external importers, whether the source still uses the target —
 * is captured up front, because moving text between files discards ts-morph node
 * identity. The planner never saves; the CLI driver owns the single tail
 * `project.save()` (skipped under `--dry`).
 *
 * ## Carrying imports surgically (no organizeImports)
 *
 * The moved cohort brings exactly the imports it used, with module specifiers
 * recomputed relative to `dest`'s location. On the source side, an import the
 * cohort consumed is dropped ONLY when nothing left behind still uses it — an
 * import used by both moved and staying code stays in the source AND is added to
 * `dest`. This is deliberately done specifier-by-specifier rather than through
 * ts-morph's `organizeImports()`, which would reorder every unrelated import and
 * pollute the diff.
 */

import { Node } from 'ts-morph';
import type {
  Identifier,
  ImportDeclaration,
  ImportSpecifier,
  Project,
  SourceFile,
  Statement,
} from 'ts-morph';
import { classifyLocalDeps } from './classifyLocalDeps';
import { ensureNamedImport } from './ensureNamedImport';
import { retargetNamedImport } from './retargetNamedImport';
import type { ResolvedSymbol } from './resolveSymbol';

// One binding a source import brings in, paired with the two facts the move needs:
// does the cohort use it (→ carry into dest), does anything else use it (→ keep in
// source). Both are computed from the pre-mutation tree.
type ImportBinding = {
  readonly importDecl: ImportDeclaration;
  readonly spec?: ImportSpecifier; // present for named imports; absent for default/namespace
  readonly kind: 'named' | 'default' | 'namespace';
  readonly local: Identifier; // the local identifier (alias when aliased)
  readonly usedByCohort: boolean;
  readonly usedOutside: boolean;
};

export function planExtract(project: Project, resolved: ResolvedSymbol, dest: string): void {
  // --- Validation (all-or-nothing): both refusals precede any mutation. ---
  if (project.getSourceFile(dest) !== undefined) {
    throw new Error(
      `Cannot extract to '${dest}': that file already exists. Choose a destination that does not.`,
    );
  }
  const { shared, exclusive } = classifyLocalDeps(resolved);
  if (shared.length > 0) {
    throw new Error(
      `Cannot extract '${resolved.name}': it depends on file-local helper(s) that code left ` +
        `behind also uses — ${shared.join(', ')}. A shared helper is its own concern: extract ` +
        `it to its own file first, then re-run so the closure is all-exclusive.`,
    );
  }

  const sourceFile = resolved.sourceFile;

  // --- Capture everything the mutation needs before node identity is lost. ---
  // The cohort's statement nodes, in original declaration order: the target plus
  // each exclusive dep. Ranges pin which references fall inside the cohort.
  const cohortNodes = orderedCohort(sourceFile, resolved, exclusive);
  const cohortRanges = cohortNodes.map((node) => [node.getStart(), node.getEnd()] as const);
  const cohortText = cohortNodes.map((node) => node.getText(true)).join('\n\n');

  const bindings = collectImportBindings(sourceFile, cohortRanges);
  const targetStillUsed = referencedOutsideCohort(targetName(resolved), cohortRanges, sourceFile);

  // --- Mutate. ---
  const destFile = project.createSourceFile(dest, cohortText);
  carryImports(destFile, bindings);
  repointTargetImporters(project, sourceFile, destFile, resolved.name);
  for (const node of cohortNodes) node.remove();
  if (targetStillUsed) ensureNamedImport(sourceFile, destFile, resolved.name);
  pruneCarriedImports(bindings);
}

// The moving cohort as statement nodes in declaration order. The target's node is
// its movable statement (a variable's whole `const`/`export const` line, not just
// the declarator); each exclusive dep is located by name among the file's locals.
function orderedCohort(
  sourceFile: SourceFile,
  resolved: ResolvedSymbol,
  exclusive: readonly string[],
): Statement[] {
  const nodes: Statement[] = [statementOf(resolved.declaration)];
  for (const name of exclusive) nodes.push(statementOf(localDeclaration(sourceFile, name)));
  return nodes.sort((a, b) => a.getStart() - b.getStart());
}

// The top-level statement carrying a declaration: a VariableDeclaration's owning
// VariableStatement (so `export const x = …` moves whole), or the declaration node
// itself for functions/classes/enums/type aliases (which already are statements).
function statementOf(declaration: Node): Statement {
  if (Node.isVariableDeclaration(declaration)) {
    const statement = declaration.getVariableStatement();
    if (statement === undefined) {
      throw new Error(
        `extract: '${declaration.getName()}' is a variable declaration with no owning statement.`,
      );
    }
    return statement;
  }
  if (!Node.isStatement(declaration)) {
    throw new Error(
      `extract: cannot move a ${declaration.getKindName()} — it is not a movable top-level statement.`,
    );
  }
  return declaration;
}

// Locate an unexported local by name across every declaration kind a helper takes.
function localDeclaration(sourceFile: SourceFile, name: string): Node {
  const found =
    sourceFile.getFunction(name) ??
    sourceFile.getClass(name) ??
    sourceFile.getEnum(name) ??
    sourceFile.getTypeAlias(name) ??
    sourceFile.getVariableDeclaration(name);
  if (found === undefined) {
    throw new Error(`extract: could not find the local helper '${name}' to move.`);
  }
  return found;
}

// Every named/default/namespace binding of every source import, tagged with whether
// the cohort uses it and whether anything outside the cohort does — the two facts
// that decide carry-into-dest and keep-in-source independently.
function collectImportBindings(
  sourceFile: SourceFile,
  cohortRanges: readonly (readonly [number, number])[],
): ImportBinding[] {
  const bindings: ImportBinding[] = [];
  const record = (
    importDecl: ImportDeclaration,
    kind: ImportBinding['kind'],
    local: Identifier,
    spec?: ImportSpecifier,
  ): void => {
    bindings.push({
      importDecl,
      spec,
      kind,
      local,
      usedByCohort: hasReferenceIn(local, sourceFile, cohortRanges, true),
      usedOutside: hasReferenceIn(local, sourceFile, cohortRanges, false),
    });
  };
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const def = importDecl.getDefaultImport();
    if (def !== undefined) record(importDecl, 'default', def);
    const ns = importDecl.getNamespaceImport();
    if (ns !== undefined) record(importDecl, 'namespace', ns);
    for (const spec of importDecl.getNamedImports()) {
      // The local binding is the alias when present, else the name node. A
      // string-literal import name (`import { 'x' as y }`) always has an alias, so
      // a bare non-identifier name has no local binding to track — skip it.
      const nameNode = spec.getNameNode();
      const local = spec.getAliasNode() ?? (Node.isIdentifier(nameNode) ? nameNode : undefined);
      if (local !== undefined) record(importDecl, 'named', local, spec);
    }
  }
  return bindings;
}

// Whether `local` has a use in `sourceFile` inside (or, when `inside` is false,
// outside) the cohort ranges. The binding's own declaration site is skipped.
function hasReferenceIn(
  local: Identifier,
  sourceFile: SourceFile,
  cohortRanges: readonly (readonly [number, number])[],
  inside: boolean,
): boolean {
  for (const ref of local.findReferencesAsNodes()) {
    if (ref.getSourceFile() !== sourceFile) continue;
    if (ref.getStart() === local.getStart()) continue; // the import binding itself
    if (inAnyRange(ref.getStart(), cohortRanges) === inside) return true;
  }
  return false;
}

// Whether the target is referenced by code that STAYS — a use in the source file
// that is neither its own declaration nor inside the moving cohort.
function referencedOutsideCohort(
  targetLocal: Identifier | undefined,
  cohortRanges: readonly (readonly [number, number])[],
  sourceFile: SourceFile,
): boolean {
  if (targetLocal === undefined) return false;
  for (const ref of targetLocal.findReferencesAsNodes()) {
    if (ref.getSourceFile() !== sourceFile) continue;
    if (ref.getStart() === targetLocal.getStart()) continue;
    if (!inAnyRange(ref.getStart(), cohortRanges)) return true;
  }
  return false;
}

function inAnyRange(pos: number, ranges: readonly (readonly [number, number])[]): boolean {
  return ranges.some(([start, end]) => pos >= start && pos < end);
}

// The target's own name identifier, from which its references are walked.
function targetName(resolved: ResolvedSymbol): Identifier | undefined {
  const declaration = resolved.declaration;
  const maybeNamed = declaration as { getNameNode?: () => Node | undefined };
  const nameNode = maybeNamed.getNameNode?.();
  return nameNode !== undefined && Node.isIdentifier(nameNode) ? nameNode : undefined;
}

// Add each cohort-used import to dest, one import declaration per source import that
// contributed a used binding, module specifiers recomputed relative to dest.
function carryImports(destFile: SourceFile, bindings: readonly ImportBinding[]): void {
  const byDecl = new Map<ImportDeclaration, ImportBinding[]>();
  for (const binding of bindings) {
    if (!binding.usedByCohort) continue;
    const group = byDecl.get(binding.importDecl) ?? [];
    group.push(binding);
    byDecl.set(binding.importDecl, group);
  }
  for (const [importDecl, group] of byDecl) {
    destFile.addImportDeclaration({
      moduleSpecifier: specifierFromDest(destFile, importDecl),
      isTypeOnly: importDecl.isTypeOnly(),
      defaultImport: group.find((b) => b.kind === 'default')?.local.getText(),
      namespaceImport: group.find((b) => b.kind === 'namespace')?.local.getText(),
      namedImports: group
        .filter((b): b is ImportBinding & { spec: ImportSpecifier } => b.spec !== undefined)
        .map((b) => ({
          name: b.spec.getNameNode().getText(),
          alias: b.spec.getAliasNode()?.getText(),
          isTypeOnly: b.spec.isTypeOnly(),
        })),
    });
  }
}

// A source import's module specifier as seen from dest: recomputed relative when it
// points at a file in the project, kept verbatim for a bare package specifier.
function specifierFromDest(destFile: SourceFile, importDecl: ImportDeclaration): string {
  const importedFile = importDecl.getModuleSpecifierSourceFile();
  return importedFile !== undefined
    ? destFile.getRelativePathAsModuleSpecifierTo(importedFile)
    : importDecl.getModuleSpecifierValue();
}

// Repoint every external importer of the target from the source file at dest,
// preserving any local alias and merging into an existing dest-import.
function repointTargetImporters(
  project: Project,
  sourceFile: SourceFile,
  destFile: SourceFile,
  name: string,
): void {
  for (const file of project.getSourceFiles()) {
    if (file === sourceFile || file === destFile) continue;
    for (const importDecl of [...file.getImportDeclarations()]) {
      if (importDecl.getModuleSpecifierSourceFile() !== sourceFile) continue;
      const spec = importDecl.getNamedImports().find((named) => named.getName() === name);
      if (spec === undefined) continue;
      retargetNamedImport(file, importDecl, spec, destFile, name);
    }
  }
}

// Drop the source-side imports the cohort carried away, but ONLY those nothing left
// behind still uses. Bindings from the same import declaration are handled together
// so the whole clause is removed when every one of its names left.
function pruneCarriedImports(bindings: readonly ImportBinding[]): void {
  const byDecl = new Map<ImportDeclaration, ImportBinding[]>();
  for (const binding of bindings) {
    if (!binding.usedByCohort || binding.usedOutside) continue; // still needed → keep
    const group = byDecl.get(binding.importDecl) ?? [];
    group.push(binding);
    byDecl.set(binding.importDecl, group);
  }
  for (const [importDecl, group] of byDecl) {
    const remainingNamed =
      importDecl.getNamedImports().length - group.filter((b) => b.kind === 'named').length;
    const losesDefault = group.some((b) => b.kind === 'default');
    const losesNamespace = group.some((b) => b.kind === 'namespace');
    const keepsDefault = importDecl.getDefaultImport() !== undefined && !losesDefault;
    const keepsNamespace = importDecl.getNamespaceImport() !== undefined && !losesNamespace;
    if (remainingNamed === 0 && !keepsDefault && !keepsNamespace) {
      importDecl.remove();
      continue;
    }
    for (const binding of group) {
      if (binding.kind === 'named') binding.spec?.remove();
      else if (binding.kind === 'default') importDecl.removeDefaultImport();
      else importDecl.removeNamespaceImport();
    }
  }
}
