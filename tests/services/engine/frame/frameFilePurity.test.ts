/**
 * A file under `src/services/engine/frame/` — and its `timing/` and `passes/`
 * subfolders — declares ONE thing: the symbol it is named for (for a pass file,
 * its `ContentPass`). Helpers and constants inlined beside it are invisible to
 * the rest of the codebase and untestable alone, and agents keep re-adding them
 * — hence a ratchet rather than a review note. `ALLOWED` carries today's debt,
 * keyed `<swept dir>/<file>` so the three sweeps can't borrow each other's
 * budgets; rows only ever go DOWN.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Node, Project, type Statement } from 'ts-morph';

const FRAME_DIR = fileURLToPath(new URL('../../../../src/services/engine/frame/', import.meta.url));

// Files that still inline helpers, with their current count. `slabs.ts` is the
// slab vocabulary itself — a genuine multi-symbol module whose split is its own
// piece of work, not a stray-helper row to trim in passing. `orbitTrailsPass`'s
// row is its cross-frame `staging` scratch — sized from the elements table,
// owned by that pass alone, so it has nowhere else to live.
const ALLOWED: Readonly<Record<string, number>> = {
  'frame/checkFrameOrder': 2,
  'frame/cosmoLabelProjection': 1,
  'frame/deriveBodyStates': 3,
  'frame/executeFrame': 7,
  'frame/expandFrameOrder': 6,
  'frame/foregroundMaxDistance': 1,
  'frame/milkyWayCloudLiveness': 1,
  'frame/near0LabelProjection': 1,
  'frame/partitionBodiesByPresentation': 1,
  'frame/partitionStarsByResolution': 1,
  'frame/pickProgram': 5,
  'frame/projectFramePose': 1,
  'frame/renderFrame': 2,
  'frame/runBloom': 1,
  'frame/runFrame': 3,
  'frame/sceneOccluderSpheres': 1,
  'frame/skyCubemapFaceContext': 5,
  'frame/slabs': 18,
  'frame/visibleSlabBodies': 3,
  'frame/visibleStars': 1,
  'frame/passes/bodyGlintsPass': 8,
  'frame/passes/cloudShellPass': 1,
  'frame/passes/constellationsPass': 2,
  'frame/passes/earthPass': 6,
  'frame/passes/fieldStarSpherePass': 6,
  'frame/passes/filamentsPass': 3,
  'frame/passes/horizonShellPass': 1,
  'frame/passes/milkyWayPass': 1,
  'frame/passes/orbitTrailsPass': 1,
  'frame/passes/planetsPass': 1,
  'frame/passes/ringsPass': 1,
  'frame/passes/sgrAStarLensingPass': 5,
  'frame/passes/starCatalogPass': 26,
  'frame/passes/starPointsPass': 3,
  'frame/passes/texturedBodiesPass': 2,
  'frame/passes/zoneOfAvoidancePass': 4,
};

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
  compilerOptions: {},
});

type Declared = { readonly name: string; readonly exported: boolean };

/** Top-level VALUE declarations; types are `src/@types/`'s business, not this sweep's. */
function declarationsOf(stmt: Statement): readonly Declared[] {
  if (Node.isImportDeclaration(stmt) || Node.isExportDeclaration(stmt)) return [];
  if (Node.isTypeAliasDeclaration(stmt) || Node.isInterfaceDeclaration(stmt)) return [];
  if (Node.isVariableStatement(stmt)) {
    const exported = stmt.isExported();
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
    return [{ name: stmt.getName() ?? '(anonymous)', exported: stmt.isExported() }];
  }
  return [{ name: stmt.getKindName(), exported: false }];
}

// `bodySlabCapacity.ts` exports `BODY_SLAB_CAPACITY`: a SCREAMING constant's
// file is its camelCase spelling, so filename↔symbol matching ignores case and
// underscores.
const normalize = (name: string): string => name.replace(/_/g, '').toLowerCase();

/** Everything declared beside the file's own symbol (the export it is named for). */
function strayDeclarations(path: string, base: string): readonly string[] {
  const declared = project.addSourceFileAtPath(path).getStatements().flatMap(declarationsOf);
  const named = declared.findIndex((d) => d.exported && normalize(d.name) === normalize(base));
  // A file whose export name carries a unit suffix (`…MaxDistance.ts` exporting
  // `…_MAX_DISTANCE_MPC`) still has exactly one own symbol — fall back to the
  // first export rather than billing it as a stray.
  const own = named >= 0 ? named : declared.findIndex((d) => d.exported);
  return declared.filter((_, i) => i !== own).map((d) => d.name);
}

describe.each([
  ['frame', FRAME_DIR],
  ['frame/timing', FRAME_DIR + 'timing/'],
  ['frame/passes', FRAME_DIR + 'passes/'],
])('%s files declare only their own symbol', (label, dir) => {
  // `passes/index.ts` is the registry barrel, not a pass; the other two dirs
  // have no barrel and CLAUDE.md forbids adding one.
  const files = readdirSync(dir).filter(
    (f) => f.endsWith('.ts') && !(label === 'frame/passes' && f === 'index.ts'),
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
