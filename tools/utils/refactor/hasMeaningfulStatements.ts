/**
 * hasMeaningfulStatements — is anything left in a source file that would be lost
 * if the file were deleted, once every top-level import is discounted?
 *
 * The refactor planners drop a source file only when the symbol they removed was
 * its sole reason to exist. After the removal, a file whose remaining top-level
 * statements are all `import` declarations is an empty husk — the imports were
 * only there to feed the now-gone symbol, so nothing of value goes with the file.
 * Anything else (a lingering `const`, a bare side-effecting call) is a statement
 * a delete would silently destroy, so it counts as meaningful and keeps the file
 * alive.
 *
 * This is the shared predicate both `planDelete` (sole-export delete) and
 * `planInline` (one-symbol wrapper elimination) gate their file removal on — one
 * definition of 'husk', not two that can drift.
 */

import { Node } from 'ts-morph';
import type { SourceFile } from 'ts-morph';

export function hasMeaningfulStatements(sourceFile: SourceFile): boolean {
  return sourceFile.getStatements().some((statement) => !Node.isImportDeclaration(statement));
}
