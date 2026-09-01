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
 * The camera-pivot work (spec §10) added a second legitimate seam,
 * `poseFrameConversion.ts`'s world-arm/body-arm pair, and put the ENGAGED
 * camera path (`services/engine/camera`, `services/camera`, `utils/camera`)
 * under the same gate as the render path above.
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

// The two seams themselves: deliberately excluded from TS_FILES below (they
// ARE the allowed conversion sites), documented instead in the first `it`.
const SEAM_FILES: readonly string[] = [
  'src/services/engine/camera/bodyRelativePose.ts',
  'src/services/engine/camera/poseFrameConversion.ts',
];

// The body-slab path AND the engaged camera path, DERIVED by sweeping the
// directories the migrations actually put files in — a new file dropped into
// any of these (a layer, a body renderer, a driver) is gated with no
// hand-edit here. `walk` recurses, so sweeping 'frame' also covers
// 'frame/passes', and sweeping 'utils/camera' also covers what used to be
// two separate single-file entries (`composeBodySlabMvp.ts`,
// `bodySlabCamLocal.ts`) — no longer named apart from the walk. The two
// remaining single-file entries aren't under any swept dir, so they stay
// named (a rename/move of one of them is then a deliberate edit here, not a
// silent drop from the gate).
const TS_FILES: readonly string[] = [
  ...walk('src/services/engine/frame', ['.ts']),
  ...walk('src/services/gpu/renderers/bodies', ['.ts']),
  ...walk('src/services/engine/camera', ['.ts']),
  ...walk('src/services/camera', ['.ts']),
  ...walk('src/utils/camera', ['.ts']),
  'src/utils/scene/cutSurfaceTiles.ts',
  'src/utils/scene/starSphereRangeM.ts',
].filter((f) => !SEAM_FILES.includes(f));

// A glob typo (wrong dir name, wrong extension) would silently sweep zero
// files and this whole test would vacuously pass — assert the sweep found
// real content, and specifically the files each finding was written about.
const KNOWN_ANCHOR_FILES: readonly string[] = [
  'src/services/engine/frame/passes/earthLayer.ts',
  'src/services/engine/frame/frameProgram.ts',
  'src/services/engine/frame/visibleSlabBodies.ts',
  'src/services/gpu/renderers/bodies/planetRenderer.ts',
  'src/services/engine/camera/cameraDrivers.ts',
  'src/services/camera/orbitControls.ts',
  'src/utils/camera/computeViewProj.ts',
];

const WESL_FILES: readonly string[] = walk('src/services/gpu/shaders/bodies', ['.wesl']);

// The ONE table of "files on the body-slab path or the engaged camera path
// allowed to bridge Mpc<->m outside the two seams (bodyRelativePose.ts,
// poseFrameConversion.ts), and why" — folds in what used to be three separate
// homes for this same question: this map (originally 3 cull/fade entries),
// starSphereRangeM.ts's own header (a distinct NEAR0 exception), and
// visibleSlabBodies.ts's undocumented use (radar findings 1+2,
// .superpowers/sdd/2026-08-26-body-render-slabs/radar-seams-tests.md). Each
// entry names the category so a NEW use beyond these needs its own line —
// keeping this a real (if per-file) gate, not a rubber stamp.
const SCALE_UNITS_ALLOW_LIST: ReadonlyMap<string, string> = new Map([
  [
    'src/services/engine/frame/passes/earthLayer.ts',
    'cull/fade precedent — bridges radiusM to Mpc to call the shared apparentSizePx sub-pixel cull and baseGlobeFadeAlpha (both outside the body-slab path, both Mpc-shaped APIs)',
  ],
  [
    'src/services/engine/frame/passes/cloudShellLayer.ts',
    'cull/fade precedent — bridges radiusM to Mpc for the same apparentSizePx cull and for cloudDeckFade (outside the body-slab path)',
  ],
  [
    'src/services/engine/frame/passes/ringsLayer.ts',
    'cull/fade precedent — bridges the ring outer radius/distance to Mpc to call the shared apparentSizePx sub-pixel cull (outside the body-slab path)',
  ],
  [
    'src/services/engine/frame/visibleSlabBodies.ts',
    'candidacy-math precedent — the pixel-floor/frustum roster gate runs entirely in Mpc (camPosMpc, positionMpc); ruled correct in radar-seams-tests.md finding 1, not a re-derivation of a slab MVP',
  ],
  [
    'src/services/engine/frame/bodyTextureLoadRadius.ts',
    'candidacy-math precedent — converts a body radius to an Mpc load-distance threshold for the texture-demand gate, no slab MVP involved',
  ],
  [
    'src/services/engine/frame/atmosphereDrawList.ts',
    'cull precedent — bridges radiusM to Mpc to call the shared apparentSizePx sub-pixel cull, same shape as earthLayer/cloudShellLayer',
  ],
  [
    'src/services/engine/frame/passes/starSpheresLayer.ts',
    "NEAR0 star-sphere precedent — scales a star's radiusM into the RENDER_ORIGIN_MPC-relative NEAR0 model matrix via composeBodyMvp, not the body-slab's composeBodySlabMvp",
  ],
  [
    'src/utils/scene/starSphereRangeM.ts',
    "NEAR0 star-sphere precedent (spec §7.1) — folds a Mpc DISTANCE SCALAR (camera-to-sphere hypot) to metres for NEAR0's distanceRangeM, not a pose; the one exception spec §7.1 carves for the star-sphere interval",
  ],
  [
    'src/services/engine/frame/slabs.ts',
    "deriveSlabs is the seam's CALLER, not a second compose site: bodySlabRow's near/far/vp consume bodyRelativePose's already-metre-native pose untouched; its own MPC_TO_M/M_TO_MPC uses are COSMO's fixed distanceRangeM bracket and a body row's screen-footprint (radiusPx) bridge into bodyApparentDiameterPx — cull/fade precedent again, not pose math",
  ],
  [
    'src/services/engine/camera/bodyLikeFraming.ts',
    'framing-bridge precedent — converts a body radius to Mpc so bodyFocusDistance and the returned FocusFraming.radius can compose with Mpc-shaped framing math (camera-pivot controller verification, spec §10), not a pose re-derivation',
  ],
  [
    'src/services/engine/camera/cameraDrivers.ts',
    "framing-bridge precedent (line 332) — the followBody driver's initial-approach branch converts the focused body's radiusM to Mpc to seed bodyFocusDistance's framing target, the same radius->Mpc bridge as bodyLikeFraming, not pose math",
  ],
  [
    'src/services/engine/camera/pivotRadiusMpc.ts',
    "framing-bridge precedent — the SelectionRow's radiusM to Mpc bridge feeding clampDistance's floor argument (zoom floor, pinch floor, follow driver's distance target all derive from it), not a pose re-derivation",
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
  it('bodyRelativePose.ts and poseFrameConversion.ts are the only files the migrations allow to convert Mpc<->metres', () => {
    // Documents the two seams this whole test protects rather than
    // re-asserting a fact ts-morph already proves in each file's own header
    // comment — both files are deliberately NOT in TS_FILES above (SEAM_FILES
    // filters them out of every swept dir).
    const bodyRelativePose = readFileSync('src/services/engine/camera/bodyRelativePose.ts', 'utf8');
    expect(bodyRelativePose).toContain('MPC_TO_M');
    const poseFrameConversion = readFileSync(
      'src/services/engine/camera/poseFrameConversion.ts',
      'utf8',
    );
    expect(poseFrameConversion).toContain('M_TO_MPC');
  });

  it('the directory sweep found real files, including each known anchor', () => {
    // A typo'd glob dir/extension returns [] silently and every it.each below
    // would vacuously pass with zero cases — this is the loud-failure check.
    // Five swept dirs now (~145 files at time of writing); 100 leaves ample
    // margin below the true count while still catching an empty/typo'd walk.
    expect(TS_FILES.length).toBeGreaterThan(100);
    for (const anchor of KNOWN_ANCHOR_FILES) {
      expect(TS_FILES).toContain(anchor);
    }
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
