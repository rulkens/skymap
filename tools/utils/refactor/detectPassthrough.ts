/**
 * detectPassthrough — decide whether a resolved symbol is a pure proxy for some
 * other symbol, and if so, name that underlying symbol.
 *
 * ## Why passthrough-only, and why the tool refuses everything else
 *
 * General inlining — folding a function's body into each of its call sites — is a
 * per-call-site judgement: the arguments differ, the surrounding expression
 * differs, and whether the inlined form reads better is a human call. A tool that
 * guessed would silently rewrite live code into something subtly wrong. So the
 * `inline` subcommand handles ONLY the mechanical case where there is nothing to
 * judge: the symbol forwards, unchanged, to another symbol. Anything richer than a
 * straight passthrough returns `null` here and `planInline` refuses, handing the
 * operator the reference list to edit by hand.
 *
 * ## The three passthrough shapes
 *
 * Exactly three declaration shapes forward with no added meaning:
 *
 *   - alias:      `export const foo = bar`      — a bare identifier initializer.
 *   - wrapper:    `export function foo(x) { return bar(x) }`
 *                 — a single `return` calling `bar` with the SAME parameters, in
 *                   the SAME order, and nothing else.
 *   - re-export:  `export { bar as foo }`       — a named re-export specifier.
 *
 * The wrapper case is where correctness lives. A reordered argument list, a
 * dropped or added argument, a default value on a parameter, a destructured
 * parameter, an `async`, a second statement, or any operator wrapped around the
 * call (`return bar(x) + 1`) all mean the wrapper is doing MORE than forwarding —
 * so each disqualifies it and the function returns `null`. The guard is
 * deliberately strict: a false positive here would let `inline` mangle real logic.
 *
 * `PassthroughTarget` is co-located with its detector (the `applyMoves.ts` ->
 * `MovePair` pattern): it only means anything as this function's output.
 */

import { Node } from 'ts-morph';
import type {
  ExportSpecifier,
  FunctionDeclaration,
  ParameterDeclaration,
  VariableDeclaration,
} from 'ts-morph';
import type { ResolvedSymbol } from './resolveSymbol';

export type PassthroughTarget = {
  readonly kind: 'alias' | 'wrapper' | 're-export';
  readonly underlying: string; // identifier the proxy forwards to
};

export function detectPassthrough(resolved: ResolvedSymbol): PassthroughTarget | null {
  // A re-export lives as an `export {}` specifier in the wrapper file, distinct
  // from the declaration `resolveSymbol` followed it to, so it is detected against
  // the source file's export clauses before falling back to the declaration shape.
  const reExport = detectReExport(resolved);
  if (reExport !== null) return reExport;

  const declaration = resolved.declaration;
  if (Node.isVariableDeclaration(declaration)) return detectAlias(declaration);
  if (Node.isFunctionDeclaration(declaration)) return detectWrapper(declaration);
  return null;
}

// `export { bar as foo }` (with or without a `from`): find the specifier whose
// exported name (its alias, or its own name when un-aliased) is the target, and
// report the original name it forwards to.
function detectReExport(resolved: ResolvedSymbol): PassthroughTarget | null {
  for (const exportDecl of resolved.sourceFile.getExportDeclarations()) {
    for (const spec of exportDecl.getNamedExports()) {
      const aliasNode = spec.getAliasNode();
      const exportedName = aliasNode?.getText() ?? spec.getNameNode().getText();
      if (exportedName !== resolved.name) continue;

      // A bare `export { foo }` that re-states a declaration living in THIS file is
      // an export marker for a local symbol, not a proxy forwarding to another one:
      // its underlying would equal its exported name, and removing the clause would
      // orphan importers of a symbol that is still declared here. Only a genuine
      // forward — an alias, or a name resolving to another file — is a passthrough.
      if (aliasNode === undefined && resolvesToSameFile(resolved, spec)) return null;

      return { kind: 're-export', underlying: spec.getNameNode().getText() };
    }
  }
  return null;
}

// True when an un-aliased export specifier's name binds to a declaration in the
// same file (a local `export { foo }`), as opposed to a name pulled in from another
// module (`export { bar } from './bar'`, or an `import`-then-`export` re-export).
function resolvesToSameFile(resolved: ResolvedSymbol, spec: ExportSpecifier): boolean {
  const symbol = spec.getNameNode().getSymbol();
  const target = symbol?.getAliasedSymbol() ?? symbol;
  return (
    target?.getDeclarations().some((decl) => decl.getSourceFile() === resolved.sourceFile) ?? false
  );
}

// `export const foo = bar` — an alias only when the initializer is a bare
// identifier. `export const foo = bar()` (a call) or any expression is real work.
function detectAlias(declaration: VariableDeclaration): PassthroughTarget | null {
  const initializer = declaration.getInitializer();
  if (initializer !== undefined && Node.isIdentifier(initializer)) {
    return { kind: 'alias', underlying: initializer.getText() };
  }
  return null;
}

// `export function foo(x) { return bar(x) }` — a wrapper only when the body is a
// single `return` of a call to a bare identifier whose arguments are exactly the
// parameters, in order, with no reshaping. Every other shape is added logic.
function detectWrapper(fn: FunctionDeclaration): PassthroughTarget | null {
  if (fn.isAsync()) return null; // an await turns forwarding into sequencing

  const body = fn.getBody();
  if (body === undefined || !Node.isBlock(body)) return null;
  const statements = body.getStatements();
  if (statements.length !== 1) return null;

  const only = statements[0];
  if (!Node.isReturnStatement(only)) return null;
  const expression = only.getExpression();
  if (expression === undefined || !Node.isCallExpression(expression)) return null;

  const callee = expression.getExpression();
  if (!Node.isIdentifier(callee)) return null;

  const paramNames = forwardableParamNames(fn.getParameters());
  if (paramNames === null) return null;

  const args = expression.getArguments();
  if (args.length !== paramNames.length) return null;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!Node.isIdentifier(arg) || arg.getText() !== paramNames[i]) return null;
  }

  return { kind: 'wrapper', underlying: callee.getText() };
}

// The parameter names as they must appear, in order, in the forwarded call — or
// null when a parameter carries meaning a passthrough cannot (a default value, a
// rest gather, a destructuring pattern), which disqualifies the whole wrapper.
function forwardableParamNames(params: ParameterDeclaration[]): string[] | null {
  const names: string[] = [];
  for (const param of params) {
    if (param.hasInitializer()) return null; // default value = added logic
    if (param.isRestParameter()) return null; // spread reshapes the argument list
    const nameNode = param.getNameNode();
    if (!Node.isIdentifier(nameNode)) return null; // destructuring pattern
    names.push(nameNode.getText());
  }
  return names;
}
