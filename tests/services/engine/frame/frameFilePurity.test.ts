/**
 * A file under `src/services/engine/frame/` — and its `timing/` and `passes/`
 * subfolders, and every Layer's own `passes/` — declares ONE thing: the symbol
 * it is named for (for a pass file, its `ContentPass`). Helpers and constants
 * inlined beside it are invisible to the rest of the codebase and untestable
 * alone, and agents keep re-adding them — hence a ratchet rather than a review
 * note. `ALLOWED` carries today's debt, keyed `<swept dir>/<file>` so the
 * sweeps can't borrow each other's budgets; rows only ever go DOWN.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Node, SyntaxKind, type Statement } from 'ts-morph';
import { parseOnlyProject } from '../../../helpers/conventions/parseOnlyProject';

const FRAME_DIR = fileURLToPath(new URL('../../../../src/services/engine/frame/', import.meta.url));
const LAYERS_DIR = fileURLToPath(new URL('../../../../src/layers/', import.meta.url));

// A Layer's passes are frame passes that happen to live in the Layer, so they
// are swept on the same terms — derived, so a new Layer's `passes/` is gated
// the day it appears rather than when someone remembers this file.
// `withFileTypes` is load-bearing: `src/layers/` holds a README beside the Layer
// folders, and `statSync('README.md/passes/')` throws ENOTDIR on Linux — which
// `throwIfNoEntry: false` does NOT suppress (it covers ENOENT only). A plain file
// here passed on macOS and failed CI.
const LAYER_PASS_DIRS: readonly (readonly [string, string])[] = readdirSync(LAYERS_DIR, {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => [`layers/${entry.name}/passes`, `${LAYERS_DIR}${entry.name}/passes/`] as const)
  .filter(([, dir]) => statSync(dir, { throwIfNoEntry: false })?.isDirectory() === true);

// Files that still inline helpers, with their current count. `slabs.ts` is the
// slab vocabulary itself — a genuine multi-symbol module whose split is its own
// piece of work, not a stray-helper row to trim in passing. `orbitTrailsPass`'s
// row is its cross-frame `staging` scratch — grown on demand from the roster
// length, owned by that pass alone, so it has nowhere else to live.
const ALLOWED: Readonly<Record<string, number>> = {
  'frame/checkFrameOrder': 2,
  'frame/cosmoLabelProjection': 1,
  'frame/deriveBodyStates': 3,
  'frame/executeFrame': 5,
  'frame/expandFrameOrder': 5,
  'frame/foregroundMaxDistance': 1,
  'frame/milkyWayCloudLiveness': 1,
  'frame/near0LabelProjection': 1,
  'frame/partitionBodiesByPresentation': 1,
  'frame/partitionStarsByResolution': 1,
  'frame/pickProgram': 5,
  'frame/projectFramePose': 1,
  'frame/runBloom': 1,
  'frame/runFrame': 3,
  'frame/sceneOccluderSpheres': 1,
  'frame/slabs': 18,
  'frame/visibleSlabBodies': 2,
  'frame/visibleStars': 0,
  'frame/passes/bodyGlintsPass': 3,
  'frame/passes/cloudShellPass': 1,
  'frame/passes/earthPass': 4,
  'frame/passes/horizonShellPass': 0,
  'frame/passes/milkyWayPass': 1,
  'frame/passes/orbitTrailsPass': 1,
  'frame/passes/planetsPass': 1,
  'frame/passes/ringsPass': 1,
  'frame/passes/texturedBodiesPass': 2,
  'layers/starCatalog/passes/fieldStarSpherePass': 6,
  'layers/starCatalog/passes/starPointsPass': 2,
};

type Declared = { readonly name: string; readonly exported: boolean };

// The `export` KEYWORD, not ts-morph's `isExported()`: the latter also asks
// whether the symbol is re-exported elsewhere, which drags in the type checker
// and cost this sweep ~1.7s. A frame file re-exported via `export { x }` would
// read as unexported here and blow its ALLOWED row — a loud failure, not a
// silent pass, and no frame file does it (CLAUDE.md forbids the barrel).
const isExportedStatement = (stmt: Statement): boolean =>
  Node.isModifierable(stmt) && stmt.hasModifier(SyntaxKind.ExportKeyword);

/** Top-level VALUE declarations; types are `src/@types/`'s business, not this sweep's. */
function declarationsOf(stmt: Statement): readonly Declared[] {
  if (Node.isImportDeclaration(stmt) || Node.isExportDeclaration(stmt)) return [];
  if (Node.isTypeAliasDeclaration(stmt) || Node.isInterfaceDeclaration(stmt)) return [];
  if (Node.isVariableStatement(stmt)) {
    const exported = isExportedStatement(stmt);
    return stmt
      .getDeclarationList()
      .getDeclarations()
      .map((decl) => ({ name: decl.getName(), exported }));
  }
  if (
    Node.isFunctionDeclaration(stmt) ||
    Node.isEnumDeclaration(stmt) ||
    Node.isClassDeclaration(stmt)
  ) {
    return [{ name: stmt.getName() ?? '(anonymous)', exported: isExportedStatement(stmt) }];
  }
  return [{ name: stmt.getKindName(), exported: false }];
}

// `slabRowCeiling.ts` exports `SLAB_ROW_CEILING`: a SCREAMING constant's
// file is its camelCase spelling, so filename↔symbol matching ignores case and
// underscores.
const normalize = (name: string): string => name.replace(/_/g, '').toLowerCase();

/** Everything declared beside the file's own symbol (the export it is named for). */
function strayDeclarations(path: string, base: string): readonly string[] {
  const declared = parseOnlyProject
    .addSourceFileAtPath(path)
    .getStatements()
    .flatMap(declarationsOf);
  const named = declared.findIndex((d) => d.exported && normalize(d.name) === normalize(base));
  // A file whose export name carries a unit suffix (`…MaxDistance.ts` exporting
  // `…_MAX_DISTANCE_MPC`) still has exactly one own symbol — fall back to the
  // first export rather than billing it as a stray.
  const own = named >= 0 ? named : declared.findIndex((d) => d.exported);
  return declared.filter((_, i) => i !== own).map((d) => d.name);
}

describe.each([
  ['frame', FRAME_DIR] as const,
  ['frame/timing', FRAME_DIR + 'timing/'] as const,
  ['frame/passes', FRAME_DIR + 'passes/'] as const,
  ['frame/computes', FRAME_DIR + 'computes/'] as const,
  ['frame/planners', FRAME_DIR + 'planners/'] as const,
  ...LAYER_PASS_DIRS,
])('%s files declare only their own symbol', (label, dir) => {
  // `passes/index.ts`, `computes/index.ts` and `planners/index.ts` are
  // registry barrels, not rows; the other dirs have no barrel and CLAUDE.md
  // forbids adding one.
  const files = readdirSync(dir).filter(
    (f) =>
      f.endsWith('.ts') &&
      !(
        (label === 'frame/passes' || label === 'frame/computes' || label === 'frame/planners') &&
        f === 'index.ts'
      ),
  );
  expect(files.length).toBeGreaterThan(0);

  it.each(files)('%s', (fileName) => {
    const base = fileName.replace(/\.ts$/, '');
    const key = `${label}/${base}`;
    const stray = strayDeclarations(dir + fileName, base);
    const budget = ALLOWED[key] ?? 0;
    expect(
      stray.length,
      `${fileName} declares ${stray.length} symbol(s) beside its own ` +
        `(${stray.join(', ') || 'none'}); its ALLOWED row '${key}' says ${budget}. ` +
        'Over the row: move each to its own file — a helper under src/utils/ or ' +
        'src/services/engine/frame/, a constant under src/data/ — one symbol per ' +
        'file, filename = symbol. Under it: you just extracted one, so lower the ' +
        `row to ${stray.length} in the same commit (delete it at 0). Exact, not a ` +
        'ceiling — a stale-high row silently re-permits the slot you freed.',
    ).toBe(budget);
  });
});
