/**
 * classifyLocalDeps — split the file-local helpers a symbol depends on into the
 * ones that can move OUT with it (`exclusive`) and the ones that would be orphaned
 * if they did (`shared`). This is the analytical core of the `extract` subcommand
 * (Q4 of the design record) and the single hardest piece of the CLI to get right.
 *
 * ## What counts as a dependency
 *
 * Only FILE-LOCAL, UNEXPORTED top-level declarations of the target's source file
 * are candidates — functions, consts/variables, type aliases, enums, classes.
 * Exported symbols are addressable in their own right (an `extract` on them is a
 * separate operation) and imports already live elsewhere, so neither is a helper
 * that travels with the target. The candidate set is the target's TRANSITIVE
 * closure over those locals: if the target calls `h` and `h` calls `g`, both `h`
 * and `g` are dependencies, reached target -> h -> g.
 *
 * ## exclusive vs shared, and the mid-chain subtlety
 *
 * Compute the target's transitive dependency set D over the unexported locals.
 * A member `d` of D is:
 *
 *   - `exclusive` when every reference reaching it comes from inside the moving
 *     cohort — the target itself or another member of D. Nothing that stays behind
 *     touches it, so it can be lifted out cleanly.
 *   - `shared` when at least one reference to it comes from OUTSIDE that cohort:
 *     another exported declaration, an unexported local that is NOT itself a
 *     target dependency, or a bare module-level statement.
 *
 * The load-bearing case is a MID-CHAIN share. In target -> h -> g, if `g` is also
 * called by a staying export, `g` is `shared` but `h` remains `exclusive`: `h` is
 * reached only through the target, and `g` going shared must not drag its parent
 * out with it. This is exactly why the test is "does any reference to `d` originate
 * outside {target} u D" and not "is `d` on a chain that ends at a shared symbol" —
 * a reference from another member of D is inside the cohort and does not taint `d`,
 * while a reference from anything else does, wherever on the chain `d` sits.
 *
 * ## Why `shared` deps BLOCK the extraction
 *
 * `extract` refuses to run while any dependency is `shared`, and the refusal is a
 * design signal rather than a limitation. A local helper used by both the moving
 * symbol and the code left behind is a shared concern that currently hides inside
 * one file; moving it would orphan the stayers' references, while copying it would
 * fork a single definition into two that drift. The honest resolution is to give
 * that helper its own file first (a `move`/`extract` of the helper itself), after
 * which it is an ordinary import from both sides and the original extraction
 * proceeds with an all-`exclusive` closure. Reporting the shared set by name lets
 * the operator do exactly that, deterministically.
 *
 * ## Attribution, and reference-graph mechanics
 *
 * Each reference to a local is attributed to the top-level declaration that
 * encloses it (or to module level when none does) by walking ancestors for the
 * nearest tracked node. Only {target} u locals are tracked as owners: a reference
 * that resolves to none of them sits in a staying export or at module scope, and
 * either way counts as "outside the cohort", so exported declarations need no
 * separate bookkeeping. The declaration's own name node — which ts-morph returns
 * among `findReferencesAsNodes()` — is filtered out; it points AT the symbol rather
 * than USING it.
 *
 * `LocalDepClass` is co-located with its classifier (the `applyMoves.ts` ->
 * `MovePair` pattern): it only means anything as this function's output. Output is
 * ordered by declaration position in the file so the extract's diagnostics are
 * stable across runs.
 */

import { Node } from 'ts-morph';
import type { ResolvedSymbol } from './resolveSymbol';

export type LocalDepClass = {
  readonly exclusive: readonly string[]; // unexported locals used ONLY by the target (transitively)
  readonly shared: readonly string[]; // unexported locals also referenced by code that stays
};

type LocalDecl = {
  readonly name: string;
  readonly node: Node;
  readonly start: number; // position for deterministic declaration-order output
};

// The declaration that encloses a reference: the moving target, a tracked local,
// or anything else (a staying export or a module-level statement) — 'outside' the
// moving cohort. Only the first two can source a dependency edge.
type Owner =
  | { readonly kind: 'target' }
  | { readonly kind: 'local'; readonly decl: LocalDecl }
  | { readonly kind: 'outside' };

export function classifyLocalDeps(resolved: ResolvedSymbol): LocalDepClass {
  const { sourceFile, declaration: target } = resolved;
  const targetCompiler = target.compilerNode;

  const locals = collectUnexportedLocals(sourceFile);
  const localByCompiler = new Map<object, LocalDecl>();
  for (const local of locals) localByCompiler.set(local.node.compilerNode, local);

  // Every in-file reference to each local, attributed to its enclosing owner.
  const referrers = new Map<LocalDecl, Owner[]>();
  for (const local of locals) {
    const owners: Owner[] = [];
    const node = local.node;
    if (Node.isReferenceFindable(node)) {
      for (const ref of node.findReferencesAsNodes()) {
        if (ref.getSourceFile() !== sourceFile) continue; // unexported locals only bind in-file
        if (isDeclarationSite(ref, node)) continue; // the name node points AT, not USES
        owners.push(ownerOf(ref, targetCompiler, localByCompiler));
      }
    }
    referrers.set(local, owners);
  }

  // Dependency edges: which locals each owner references directly.
  const targetDeps = new Set<LocalDecl>();
  const localDeps = new Map<LocalDecl, Set<LocalDecl>>();
  for (const local of locals) localDeps.set(local, new Set());
  for (const local of locals) {
    for (const owner of referrers.get(local) ?? []) {
      if (owner.kind === 'target') targetDeps.add(local);
      else if (owner.kind === 'local') localDeps.get(owner.decl)?.add(local);
    }
  }

  // D = the target's transitive dependency closure over the locals.
  const closure = new Set<LocalDecl>();
  const stack = [...targetDeps];
  while (stack.length > 0) {
    const dep = stack.pop() as LocalDecl;
    if (closure.has(dep)) continue;
    closure.add(dep);
    for (const next of localDeps.get(dep) ?? []) if (!closure.has(next)) stack.push(next);
  }

  const exclusive: string[] = [];
  const shared: string[] = [];
  for (const dep of [...closure].sort((a, b) => a.start - b.start)) {
    const tainted = (referrers.get(dep) ?? []).some(
      (owner) => owner.kind === 'outside' || (owner.kind === 'local' && !closure.has(owner.decl)),
    );
    (tainted ? shared : exclusive).push(dep.name);
  }
  return { exclusive, shared };
}

// The enclosing owner of a reference: the nearest tracked ancestor. A reference
// with no tracked ancestor sits in a staying export or at module level — 'outside'.
function ownerOf(
  ref: Node,
  targetCompiler: object,
  localByCompiler: Map<object, LocalDecl>,
): Owner {
  const ownerNode = ref.getFirstAncestor(
    (ancestor) =>
      ancestor.compilerNode === targetCompiler || localByCompiler.has(ancestor.compilerNode),
  );
  if (ownerNode === undefined) return { kind: 'outside' };
  if (ownerNode.compilerNode === targetCompiler) return { kind: 'target' };
  return { kind: 'local', decl: localByCompiler.get(ownerNode.compilerNode) as LocalDecl };
}

// Named, unexported top-level declarations across every declaration kind a helper
// can take. Exported ones are addressable on their own and never travel implicitly.
function collectUnexportedLocals(sourceFile: ResolvedSymbol['sourceFile']): LocalDecl[] {
  const locals: LocalDecl[] = [];
  const add = (name: string | undefined, node: Node, isExported: boolean): void => {
    if (isExported || name === undefined || name.length === 0) return;
    locals.push({ name, node, start: node.getStart() });
  };
  for (const fn of sourceFile.getFunctions()) add(fn.getName(), fn, fn.isExported());
  for (const cls of sourceFile.getClasses()) add(cls.getName(), cls, cls.isExported());
  for (const en of sourceFile.getEnums()) add(en.getName(), en, en.isExported());
  for (const ta of sourceFile.getTypeAliases()) add(ta.getName(), ta, ta.isExported());
  for (const vd of sourceFile.getVariableDeclarations()) {
    add(vd.getName(), vd, vd.getVariableStatement()?.isExported() ?? false);
  }
  return locals;
}

// ts-morph returns the declaration's own name node among its references; skip it by
// node identity so every retained entry is a genuine USE elsewhere in the file.
function isDeclarationSite(ref: Node, declaration: Node): boolean {
  const nameNode = nameNodeOf(declaration);
  return nameNode !== undefined && ref.compilerNode === nameNode.compilerNode;
}

function nameNodeOf(declaration: Node): Node | undefined {
  const maybeNamed = declaration as { getNameNode?: () => Node | undefined };
  return typeof maybeNamed.getNameNode === 'function' ? maybeNamed.getNameNode() : undefined;
}
