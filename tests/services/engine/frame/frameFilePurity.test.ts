/**
 * A file under `src/services/engine/frame/` (and its `timing/` subfolder)
 * declares ONE thing: the symbol it is named for. Helpers and constants inlined
 * beside it are invisible to the rest of the codebase and untestable alone, and
 * agents keep re-adding them — hence a ratchet rather than a review note.
 * `ALLOWED` carries today's debt; rows only ever go DOWN.
 *
 * `passes/` has its own sweep (`passes/passFilePurity.test.ts`); this one stops
 * at the two directories above so the two tables stay independently shrinkable.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Node, Project, type Statement } from 'ts-morph';

const FRAME_DIR = fileURLToPath(new URL('../../../../src/services/engine/frame/', import.meta.url));

// Frame files that still inline helpers, with their current count. `slabs.ts`
// is the slab vocabulary itself — a genuine multi-symbol module whose split is
// its own piece of work, not a stray-helper row to trim in passing.
const ALLOWED: Readonly<Record<string, number>> = {
  bodyTextureLoadRadius: 1,
  checkFrameOrder: 2,
  cosmoLabelProjection: 1,
  deriveBodyStates: 3,
  executeFrame: 7,
  expandFrameOrder: 6,
  foregroundMaxDistance: 1,
  milkyWayCloudLiveness: 1,
  near0LabelProjection: 1,
  partitionBodiesByPresentation: 1,
  partitionStarsByResolution: 1,
  pickProgram: 5,
  projectFramePose: 1,
  renderFrame: 2,
  runBloom: 1,
  runFrame: 3,
  sceneOccluderSpheres: 1,
  skyCubemapFaceContext: 5,
  slabs: 18,
  visibleSlabBodies: 3,
  visibleStars: 1,
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
])('%s files declare only their own symbol', (_label, dir) => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
  expect(files.length).toBeGreaterThan(0);

  it.each(files)('%s', (fileName) => {
    const base = fileName.replace(/\.ts$/, '');
    const stray = strayDeclarations(dir + fileName, base);
    const budget = ALLOWED[base] ?? 0;
    expect(
      stray.length,
      `${fileName} declares ${stray.length} symbol(s) beside its own ` +
        `(${stray.join(', ') || 'none'}); its ALLOWED row says ${budget}. Over ` +
        'the row: move each to its own file — one symbol per file, filename = ' +
        'symbol. Under it: you just extracted one, so lower the row to ' +
        `${stray.length} in the same commit (delete it at 0). Exact, not a ` +
        'ceiling — a stale-high row silently re-permits the slot you freed.',
    ).toBe(budget);
  });
});
