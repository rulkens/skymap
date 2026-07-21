/**
 * resolveSymbol — turn a parsed `SymbolAddress` into the concrete ts-morph
 * declaration it names, or throw a message that says exactly why it couldn't.
 *
 * ## Why resolution is its own step, and why it fails loudly
 *
 * `parseSymbolAddress` proves an address is well-FORMED; it can't prove the file
 * exists in the loaded `Project`, that the name is actually exported, or that the
 * name resolves to a SINGLE declaration. Those three checks are the load-bearing
 * error paths of the whole refactor CLI (Q7): every subcommand resolves its
 * target before mutating, so a bad address dies here with a clear diagnostic
 * rather than half-applying an edit and leaving the tree in a torn state.
 *
 * ## The ambiguity check, and why it lists candidates
 *
 * ts-morph's `SourceFile.getExportedDeclarations()` returns a
 * `Map<name, ExportedDeclarations[]>` — an ARRAY per name, because one exported
 * name can bind to more than one declaration: declaration merging (a class and a
 * namespace, an enum and a namespace) or an overloaded function's signatures.
 * A rename or move that blindly picked `declarations[0]` would silently touch one
 * arm of a merge and corrupt the other, so a name with >1 declaration is treated
 * as unresolvable. The thrown message enumerates each candidate by kind + line so
 * the operator can see WHAT collided and disambiguate at the source, instead of
 * getting a bare 'ambiguous' with no way to act on it.
 *
 * The `ResolvedSymbol` type is co-located with its resolver (the `applyMoves.ts`
 * → `MovePair` pattern), not a separate `@types` file — it's `tools/`-local and
 * only meaningful as this function's output.
 */

import type { ExportedDeclarations, Project, SourceFile } from 'ts-morph';
import type { SymbolAddress } from './parseSymbolAddress';

export type ResolvedSymbol = {
  readonly sourceFile: SourceFile;
  readonly declaration: ExportedDeclarations;
  readonly name: string;
};

export function resolveSymbol(project: Project, address: SymbolAddress): ResolvedSymbol {
  const sourceFile = project.getSourceFile(address.file);
  if (sourceFile === undefined) {
    throw new Error(
      `Cannot resolve '${address.file}#${address.symbol}': the file '${address.file}' is not in the project.`,
    );
  }

  const declarations = sourceFile.getExportedDeclarations().get(address.symbol) ?? [];
  const [declaration, ...rest] = declarations;
  if (declaration === undefined) {
    throw new Error(
      `Cannot resolve '${address.file}#${address.symbol}': '${address.symbol}' is not an exported declaration of '${address.file}'.`,
    );
  }

  if (rest.length > 0) {
    const candidates = declarations
      .map((candidate) => `  - ${candidate.getKindName()} (line ${candidate.getStartLineNumber()})`)
      .join('\n');
    throw new Error(
      `Ambiguous symbol '${address.symbol}' in '${address.file}': ${declarations.length} declarations share the name:\n${candidates}`,
    );
  }

  return { sourceFile, declaration, name: address.symbol };
}
