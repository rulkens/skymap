/**
 * A file under `src/services/engine/frame/passes/` declares ONE thing: the
 * `ContentPass` it is named for. Helpers and constants inlined beside it are
 * invisible to the rest of the codebase and untestable alone, and agents keep
 * re-adding them — hence a ratchet rather than a review note. `ALLOWED` carries
 * today's debt; rows only ever go DOWN.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Node, Project } from 'ts-morph';

const PASSES_DIR = fileURLToPath(
  new URL('../../../../../src/services/engine/frame/passes/', import.meta.url),
);

// Pass files that still inline helpers, with their current count. Lower a row
// when you extract; delete it at zero. `orbitTrailsPass`'s row is its
// cross-frame `staging` scratch — sized from the elements table, owned by that
// pass alone, so it has nowhere else to live.
const ALLOWED: Readonly<Record<string, number>> = {
  bodyGlintsPass: 8,
  cloudShellPass: 1,
  constellationsPass: 2,
  earthPass: 6,
  fieldStarSpherePass: 6,
  filamentsPass: 3,
  horizonShellPass: 1,
  milkyWayPass: 1,
  orbitTrailsPass: 1,
  planetsPass: 1,
  ringsPass: 1,
  sgrAStarLensingPass: 5,
  starCatalogPass: 26,
  starPointsPass: 3,
  texturedBodiesPass: 2,
  zoneOfAvoidancePass: 4,
};

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
  compilerOptions: {},
});

/** Top-level declarations that are neither the file's own symbol nor a type. */
function strayDeclarations(fileName: string): string[] {
  const own = fileName.replace(/\.ts$/, '');
  const stray: string[] = [];
  for (const stmt of project.addSourceFileAtPath(PASSES_DIR + fileName).getStatements()) {
    if (Node.isImportDeclaration(stmt) || Node.isExportDeclaration(stmt)) continue;
    if (Node.isTypeAliasDeclaration(stmt) || Node.isInterfaceDeclaration(stmt)) continue;
    if (Node.isVariableStatement(stmt)) {
      for (const decl of stmt.getDeclarationList().getDeclarations()) {
        if (decl.getName() !== own) stray.push(decl.getName());
      }
      continue;
    }
    const named =
      Node.isFunctionDeclaration(stmt) ||
      Node.isEnumDeclaration(stmt) ||
      Node.isClassDeclaration(stmt)
        ? (stmt.getName() ?? '(anonymous)')
        : stmt.getKindName();
    if (named !== own) stray.push(named);
  }
  return stray;
}

describe('pass files declare only the pass', () => {
  // `index.ts` is the registry barrel, not a pass.
  const files = readdirSync(PASSES_DIR).filter((f) => f.endsWith('.ts') && f !== 'index.ts');

  it.each(files)('%s', (fileName) => {
    const stray = strayDeclarations(fileName);
    const budget = ALLOWED[fileName.replace(/\.ts$/, '')] ?? 0;
    expect(
      stray.length,
      `${fileName} declares ${stray.join(', ')} beside its ContentPass. Each ` +
        'belongs in its own file — a helper under src/utils/ or ' +
        'src/services/engine/frame/, a constant under src/data/ — one symbol per ' +
        `file, filename = symbol. Budget here is ${budget}: if you just lowered ` +
        'it, lower this file’s ALLOWED row to match (rows never go up).',
    ).toBeLessThanOrEqual(budget);
  });
});
