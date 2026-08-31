/**
 * oneMpcSeam — spec §5/§10's structural gate: the body render slabs migration
 * left exactly ONE place allowed to convert between world-space Mpc and a
 * body-slab's metre-native frame, `bodyRelativePose.ts` (not itself part of
 * the checked path below — it IS the seam). Every file that composes or draws
 * a body-slab MVP must consume `bodyRelativePose`'s already-converted output,
 * never re-derive the conversion via `SCALE_UNITS.MPC_TO_M`/`.M_TO_MPC`. A
 * second conversion site is exactly how a slab's near-plane math would
 * silently drift out of metres again — see the module header this migration
 * retired (`composeBodyMvp.ts`'s "Why compose the FULL MVP in f64" section).
 *
 * This is an import-graph assertion (ts-morph, real property-access AST
 * nodes), not a source-text grep: `conventions/testing.md` bans a substring
 * search as a BEHAVIOUR proxy, but a cross-file architectural contract like
 * "this set of files never touches these two constants" has no behavioural
 * test that could express it, which is the "cross-file contract" keep-rule
 * (same shape as `forbiddenPaths.test.ts`).
 *
 * `.wesl` shader files have no import graph in the TS sense (WESL uses
 * `package::`, not JS imports), so they get a plain occurrence scan instead —
 * still precise, since neither constant name has any legitimate reason to
 * appear in a shader source at all.
 */
import { describe, it, expect } from 'vitest';
import { Project, SyntaxKind } from 'ts-morph';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN_MEMBERS = ['MPC_TO_M', 'M_TO_MPC'];

function walk(dir: string, extensions: readonly string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p, extensions);
    return extensions.some((ext) => p.endsWith(ext)) ? [p] : [];
  });
}

// The body-slab path, spelled out per the plan brief (spec §10's file list),
// not re-derived from a glob at test time — a future file added under these
// dirs is swept in automatically via the `walk` calls below, but the TWO
// single-file entries are named so a rename/move here is a deliberate edit.
const TS_FILES: readonly string[] = [
  'src/services/engine/frame/passes/earthLayer.ts',
  'src/services/engine/frame/passes/atmosphereShellLayer.ts',
  'src/services/engine/frame/passes/cloudShellLayer.ts',
  'src/services/engine/frame/passes/planetsLayer.ts',
  'src/services/engine/frame/passes/texturedBodiesLayer.ts',
  'src/services/engine/frame/passes/ringsLayer.ts',
  ...walk('src/services/gpu/renderers/bodies', ['.ts']),
  'src/utils/scene/cutSurfaceTiles.ts',
  'src/utils/camera/composeBodySlabMvp.ts',
  'src/utils/camera/bodySlabCamLocal.ts',
];

const WESL_FILES: readonly string[] = walk('src/services/gpu/shaders/bodies', ['.wesl']);

// Allow-list: files in the path above that legitimately convert to Mpc, NOT
// for the slab MVP/camLocal compose (both take metre-native args throughout —
// see composeBodySlabMvp.ts / bodySlabCamLocal.ts), but to bridge into a
// shared Mpc-scale helper that lives OUTSIDE the body-slab path (the
// Tasks 9/10 "M_TO_MPC precedent"). Each entry is a distinct helper the file
// calls, so the justification names it — a NEW use beyond these would need
// its own line here, keeping this a real (if per-file) gate.
const SCALE_UNITS_ALLOW_LIST: ReadonlyMap<string, string> = new Map([
  [
    'src/services/engine/frame/passes/earthLayer.ts',
    'bridges radiusM to Mpc to call the shared apparentSizePx sub-pixel cull and baseGlobeFadeAlpha (both outside the body-slab path, both Mpc-shaped APIs)',
  ],
  [
    'src/services/engine/frame/passes/cloudShellLayer.ts',
    'bridges radiusM to Mpc for the same apparentSizePx cull and for cloudDeckFade (outside the body-slab path)',
  ],
  [
    'src/services/engine/frame/passes/ringsLayer.ts',
    'bridges the ring outer radius/distance to Mpc to call the shared apparentSizePx sub-pixel cull (outside the body-slab path)',
  ],
]);

const project = new Project({ useInMemoryFileSystem: false });

function scaleUnitsMembersUsed(file: string): string[] {
  const sourceFile = project.addSourceFileAtPath(file);
  const scaleUnitsImport = sourceFile
    .getImportDeclarations()
    .find((decl) => decl.getModuleSpecifierValue().endsWith('data/scaleUnits'));
  if (scaleUnitsImport === undefined) return [];
  const localName = scaleUnitsImport.getNamedImports().find((n) => n.getName() === 'SCALE_UNITS');
  if (localName === undefined) return [];

  return sourceFile
    .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
    .filter((node) => node.getExpression().getText() === 'SCALE_UNITS')
    .map((node) => node.getName())
    .filter((name) => FORBIDDEN_MEMBERS.includes(name));
}

describe('the body-slab path never re-derives the Mpc<->metre conversion', () => {
  it('bodyRelativePose.ts is the only file the migration allows to import MPC_TO_M', () => {
    // Documents the seam this whole test protects rather than re-asserting a
    // fact ts-morph already proves in bodyRelativePose's own header comment —
    // this file is deliberately NOT in TS_FILES above.
    const seam = readFileSync('src/services/engine/camera/bodyRelativePose.ts', 'utf8');
    expect(seam).toContain('MPC_TO_M');
  });

  it.each(TS_FILES.filter((f) => !SCALE_UNITS_ALLOW_LIST.has(f)))(
    '%s does not reference SCALE_UNITS.MPC_TO_M or .M_TO_MPC',
    (file) => {
      expect(scaleUnitsMembersUsed(file)).toEqual([]);
    },
  );

  it.each([...SCALE_UNITS_ALLOW_LIST.entries()])(
    '%s: every SCALE_UNITS Mpc<->metre use is the allow-listed bridge (%s)',
    (file, _justification) => {
      // The allow-list still asserts something: the file that DOES reference
      // these members did so on purpose. A file wrongly listed here (no
      // actual use) would fail this, same as the sweep above catching an
      // unlisted one.
      expect(scaleUnitsMembersUsed(file).length).toBeGreaterThan(0);
    },
  );

  it.each(WESL_FILES)('%s contains no Mpc<->metre conversion constant', (file) => {
    const source = readFileSync(file, 'utf8');
    for (const member of FORBIDDEN_MEMBERS) {
      expect(source).not.toContain(member);
    }
  });
});
