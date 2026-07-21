/**
 * ensureNamedImport — add one named import (keeping any local alias) to a file,
 * merging into an existing import from the same module rather than emitting a
 * second `import` line, and skipping entirely when the local name is already
 * brought in. The module specifier is recomputed relative to the importing file,
 * so a caller never hand-builds a '../' path.
 *
 * This is the shared idempotent add-an-import primitive used wherever a refactor
 * has to make a symbol available in a file: `planInline` re-homes a repointed
 * import at the underlying's real file, and `planExtract` both re-imports a still-
 * used target back into its old source and carries the moved cohort's imports into
 * the destination. Both wanted the exact same merge-or-create-or-skip behaviour, so
 * it lives here once instead of forking into two drifting copies.
 */

import type { SourceFile } from 'ts-morph';

export function ensureNamedImport(
  file: SourceFile,
  fromFile: SourceFile,
  name: string,
  alias?: string,
): void {
  const structure = alias !== undefined && alias !== name ? { name, alias } : name;
  const localName = alias ?? name;

  const existing = file
    .getImportDeclarations()
    .find((decl) => decl.getModuleSpecifierSourceFile() === fromFile);
  if (existing !== undefined) {
    const alreadyThere = existing
      .getNamedImports()
      .some((named) => (named.getAliasNode()?.getText() ?? named.getName()) === localName);
    if (!alreadyThere) existing.addNamedImport(structure);
    return;
  }
  file.addImportDeclaration({
    moduleSpecifier: file.getRelativePathAsModuleSpecifierTo(fromFile),
    namedImports: [structure],
  });
}
