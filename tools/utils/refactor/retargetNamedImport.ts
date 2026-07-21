/**
 * retargetNamedImport — move one named import specifier so the name is brought in
 * from `destFile` instead of its current module. When the import clause carries
 * nothing but this one name, the whole clause's module specifier is retargeted in
 * place (cheapest edit, smallest diff); otherwise the specifier is split off and
 * re-added — via `ensureNamedImport`, so it merges into any existing import from
 * `destFile` — and the local alias is preserved either way.
 *
 * This is the shared repoint primitive: `planInline` uses it to point importers of
 * an inlined wrapper at the underlying symbol's real file, and `planExtract` uses
 * it to point external importers of an extracted symbol at its new destination.
 * The two had identical needs, so the logic lives here once rather than as a copy
 * in each planner.
 */

import type { ImportDeclaration, ImportSpecifier, SourceFile } from 'ts-morph';
import { ensureNamedImport } from './ensureNamedImport';

export function retargetNamedImport(
  file: SourceFile,
  importDecl: ImportDeclaration,
  spec: ImportSpecifier,
  destFile: SourceFile,
  name: string,
): void {
  const bringsInOnlyThis =
    importDecl.getNamedImports().length === 1 &&
    importDecl.getDefaultImport() === undefined &&
    importDecl.getNamespaceImport() === undefined;
  const aliasText = spec.getAliasNode()?.getText();

  if (bringsInOnlyThis) {
    importDecl.setModuleSpecifier(destFile);
    return;
  }
  spec.remove();
  ensureNamedImport(file, destFile, name, aliasText);
}
