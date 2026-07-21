/**
 * planInline — eliminate a passthrough wrapper by repointing everything that used
 * it at the symbol it forwarded to, then deleting the wrapper (and its file, when
 * the wrapper was the file's only export).
 *
 * ## Passthrough-only, and why a non-passthrough is a refusal, not a guess
 *
 * `detectPassthrough` gates this planner: only an alias, a same-signature
 * single-call wrapper, or an aliased re-export can be inlined mechanically. For
 * anything richer, folding the body into each call site is a per-call-site
 * judgement a tool must not make, so `planInline` throws with the classified
 * reference list — the same reporter the `refs` subcommand prints — and the
 * operator hand-edits the interesting sites. Detection runs BEFORE any mutation,
 * so a refusal leaves the tree untouched.
 *
 * ## What repointing means
 *
 * Every importer currently names the wrapper (`foo`) and imports it from the
 * wrapper file. After inlining, each call site names the underlying symbol (`bar`)
 * and imports it from `bar`'s OWN declaring file — leaving an import pointing at
 * the wrapper file would dangle once the wrapper is gone. The rename is done
 * through ts-morph's language service (so every call site and import specifier
 * moves in lockstep), then the imports that now bring the underlying name in
 * from the wrapper file are retargeted at its real file. The rare same-file alias
 * (`bar` declared in the wrapper file itself) needs no retarget — the module was
 * already correct — and the transient name clash the rename creates there is
 * resolved when the wrapper declaration is removed a step later.
 *
 * ## Why the file (and its mirror) go when the wrapper was the only export
 *
 * Under the house one-symbol-per-file rule, a wrapper file exists only to carry
 * the wrapper. Once the wrapper is inlined, the file's remaining statements are at
 * most the import it used to forward through — an empty husk — so the file is
 * dropped, and its `tests/` mirror with it, through the shared
 * `removeFileWithMirror` / `hasMeaningfulStatements` helpers `planDelete` uses, so
 * the husk-and-mirror convention has one definition, not two.
 *
 * ## Mutate-only, validate-first
 *
 * The planner mutates the in-memory Project and never saves — the CLI driver owns
 * the single tail `project.save()` (skipped under `--dry`), so all-or-nothing
 * batching falls out structurally and a refusal never partially writes disk.
 */

import { Node } from 'ts-morph';
import type {
  ExportSpecifier,
  FunctionDeclaration,
  Identifier,
  Project,
  SourceFile,
  VariableDeclaration,
} from 'ts-morph';
import { collectRefs } from './collectRefs';
import type { RefReport } from './collectRefs';
import { detectPassthrough } from './detectPassthrough';
import type { PassthroughTarget } from './detectPassthrough';
import { hasMeaningfulStatements } from './hasMeaningfulStatements';
import { removeFileWithMirror } from './removeFileWithMirror';
import { renderRefReport } from './renderRefReport';
import { retargetNamedImport } from './retargetNamedImport';
import type { ResolvedSymbol } from './resolveSymbol';

export function planInline(project: Project, resolved: ResolvedSymbol): void {
  const target = detectPassthrough(resolved);
  if (target === null) {
    // Not a mechanical passthrough: refuse and hand back the blast radius so the
    // operator knows which call sites to fold by hand.
    throw new Error(refusalMessage(collectRefs(project, resolved)));
  }

  const wrapperFile = resolved.sourceFile;
  const underlyingName = target.underlying;

  // Capture the mutation targets and the underlying declaring file BEFORE editing,
  // so validation is complete before anything changes and node lookups read the
  // pre-mutation tree.
  const reSpec = target.kind === 're-export' ? reExportSpecifierOrThrow(resolved) : undefined;
  const underlyingFile =
    target.kind === 're-export'
      ? resolved.declaration.getSourceFile()
      : declaringFileOf(forwardingIdentifier(resolved, target));
  const wasOnlyExport = wrapperFile.getExportedDeclarations().size === 1;

  // Rename the exported name to the underlying name, project-wide: every call site
  // and import specifier now reads `underlyingName`.
  if (reSpec !== undefined) {
    const exportedNameNode = reSpec.getAliasNode() ?? reSpec.getNameNode();
    if (!Node.isIdentifier(exportedNameNode)) {
      throw new Error(
        `inline: the re-export of '${resolved.name}' uses a string-literal name that ` +
          `cannot be inlined.`,
      );
    }
    exportedNameNode.rename(underlyingName);
  } else {
    const declaration = resolved.declaration;
    if (!Node.isRenameable(declaration)) {
      throw new Error(
        `inline: cannot rename '${resolved.name}': its declaration ` +
          `(${declaration.getKindName()}) is not renameable.`,
      );
    }
    declaration.rename(underlyingName);
  }

  // Retarget the imports that now bring `underlyingName` in from the wrapper file
  // at its real declaring file.
  repointImports(project, wrapperFile, underlyingFile, underlyingName);

  // Remove the wrapper's own declaration / re-export line.
  if (reSpec !== undefined) {
    removeSpecifier(reSpec);
  } else {
    removeDeclaration(resolved.declaration);
  }

  if (wasOnlyExport && !hasMeaningfulStatements(wrapperFile)) {
    removeFileWithMirror(project, wrapperFile);
  }
}

// The refusal header + classified reference list. renderRefReport(_, false) is the
// human table the `refs` subcommand prints; its rows name every referencing
// file:line:col, which is what makes the refusal actionable.
function refusalMessage(report: RefReport): string {
  return [
    `Cannot inline '${report.target}': it is not a passthrough wrapper (an alias, a ` +
      `same-signature single-call wrapper, or an aliased re-export). Folding a symbol ` +
      `with real logic into its call sites is a per-site judgement this tool will not ` +
      `guess — edit these ${report.refs.length} reference(s) by hand:`,
    renderRefReport(report, false),
  ].join('\n');
}

// The identifier inside the wrapper that names the underlying symbol: an alias's
// initializer, or a wrapper's call callee. Detection already proved the shape, so
// the fall-through throw only guards the types.
function forwardingIdentifier(resolved: ResolvedSymbol, target: PassthroughTarget): Identifier {
  const declaration = resolved.declaration;
  if (target.kind === 'alias' && Node.isVariableDeclaration(declaration)) {
    const initializer = (declaration as VariableDeclaration).getInitializer();
    if (initializer !== undefined && Node.isIdentifier(initializer)) return initializer;
  }
  if (target.kind === 'wrapper' && Node.isFunctionDeclaration(declaration)) {
    const callee = returnedCallCallee(declaration as FunctionDeclaration);
    if (callee !== undefined) return callee;
  }
  throw new Error(`inline: could not read the forwarding identifier for '${resolved.name}'.`);
}

function returnedCallCallee(fn: FunctionDeclaration): Identifier | undefined {
  const body = fn.getBody();
  if (body === undefined || !Node.isBlock(body)) return undefined;
  const only = body.getStatements()[0];
  if (only === undefined || !Node.isReturnStatement(only)) return undefined;
  const call = only.getExpression();
  if (call === undefined || !Node.isCallExpression(call)) return undefined;
  const callee = call.getExpression();
  return Node.isIdentifier(callee) ? callee : undefined;
}

// The file that actually declares the underlying symbol, following an import alias
// to its origin (so a wrapper forwarding to an imported `bar` resolves to `bar`'s
// file, not the wrapper's import specifier).
function declaringFileOf(idNode: Identifier): SourceFile {
  const symbol = idNode.getSymbol();
  if (symbol !== undefined) {
    const real = symbol.getAliasedSymbol() ?? symbol;
    const declaration = real.getDeclarations()[0];
    if (declaration !== undefined) return declaration.getSourceFile();
  }
  const definition = idNode.getDefinitionNodes()[0];
  if (definition !== undefined) return definition.getSourceFile();
  throw new Error(`inline: could not locate the declaration of '${idNode.getText()}'.`);
}

// After the rename, each importer names `underlyingName` but still imports it from
// the wrapper file. Point those imports at the underlying's real file instead —
// unless the underlying lives in the wrapper file itself, where the module is
// already right (only the wrapper declaration is removed).
function repointImports(
  project: Project,
  wrapperFile: SourceFile,
  underlyingFile: SourceFile,
  underlyingName: string,
): void {
  if (wrapperFile === underlyingFile) return;
  for (const sourceFile of project.getSourceFiles()) {
    if (sourceFile === wrapperFile) continue;
    for (const importDecl of [...sourceFile.getImportDeclarations()]) {
      if (importDecl.getModuleSpecifierSourceFile() !== wrapperFile) continue;
      const spec = importDecl.getNamedImports().find((named) => named.getName() === underlyingName);
      if (spec === undefined) continue;
      retargetNamedImport(sourceFile, importDecl, spec, underlyingFile, underlyingName);
    }
  }
}

// Find the `export {}` specifier whose exported name is the target. Captured before
// the rename so the node stays valid across the edit.
function reExportSpecifierOrThrow(resolved: ResolvedSymbol): ExportSpecifier {
  for (const exportDecl of resolved.sourceFile.getExportDeclarations()) {
    for (const spec of exportDecl.getNamedExports()) {
      const exportedName = spec.getAliasNode()?.getText() ?? spec.getNameNode().getText();
      if (exportedName === resolved.name) return spec;
    }
  }
  throw new Error(`inline: could not find the re-export specifier for '${resolved.name}'.`);
}

// Remove the specifier, dropping the whole `export {}` clause when it was the only
// name in it.
function removeSpecifier(spec: ExportSpecifier): void {
  const exportDecl = spec.getExportDeclaration();
  if (exportDecl.getNamedExports().length <= 1) {
    exportDecl.remove();
  } else {
    spec.remove();
  }
}

// VariableDeclaration / FunctionDeclaration both carry `.remove()`; detection
// guaranteed one of those, so the guard only keeps the types honest.
function removeDeclaration(declaration: Node): void {
  const removable = declaration as Node & { remove?: () => void };
  if (typeof removable.remove !== 'function') {
    throw new Error(
      `inline: the wrapper declaration (${declaration.getKindName()}) has no removable form.`,
    );
  }
  removable.remove();
}
