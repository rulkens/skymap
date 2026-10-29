/**
 * oneMpcSeam — structural gate: only `bodyRelativePose.ts`, `poseFrameConversion.ts` (world-arm/
 * body-arm pair) and `viewBodyPose.ts` may convert between world Mpc and a body-slab's
 * metre-native frame. Every other file on the body-slab render path or the engaged camera
 * path consumes their output, never `SCALE_UNITS.MPC_TO_M`/`.M_TO_MPC`: a second site is how
 * near-plane math drifts out of metres. An AST assertion (ts-morph), not a source-text grep:
 * no behavioural test can express "these files never touch these constants" (cf.
 * `forbiddenPaths.test.ts`). `.wesl` files have no TS import graph, so get an occurrence scan.
 */
import { describe, it, expect } from 'vitest';
import { SyntaxKind } from 'ts-morph';
import { readFileSync } from 'node:fs';
import { parseOnlyProject } from '../../../helpers/conventions/parseOnlyProject';
import { walkFiles } from '../../../helpers/conventions/walkFiles';

const FORBIDDEN_MEMBERS = ['MPC_TO_M', 'M_TO_MPC'];

// The seams themselves: deliberately excluded from TS_FILES below (they
// ARE the allowed conversion sites), documented instead in the first `it`.
const SEAM_FILES: readonly string[] = [
  'src/services/engine/camera/bodyRelativePose.ts',
  'src/services/engine/camera/poseFrameConversion.ts',
  'src/services/engine/camera/viewBodyPose.ts',
];

// The body-slab and engaged-camera paths, DERIVED by sweeping directories (`walk` recurses), so a
// new file there is gated with no hand-edit. The single-file entries below stay named so a
// rename is a deliberate edit, not a silent drop.
const TS_FILES: readonly string[] = [
  ...walkFiles('src/services/engine/frame', ['.ts']),
  ...walkFiles('src/services/gpu/renderers/bodies', ['.ts']),
  ...walkFiles('src/services/engine/camera', ['.ts']),
  ...walkFiles('src/services/camera', ['.ts']),
  ...walkFiles('src/utils/camera', ['.ts']),
  ...walkFiles('src/layers', ['.ts']),
  'src/utils/star/starSphereRangeM.ts',
].filter((f) => !SEAM_FILES.includes(f));

// A glob typo (wrong dir name, wrong extension) would silently sweep zero
// files and this whole test would vacuously pass — assert the sweep found
// real content, and specifically the files each finding was written about.
const KNOWN_ANCHOR_FILES: readonly string[] = [
  'src/layers/body/passes/earthPass.ts',
  'src/services/engine/frame/timing/timedSlots.ts',
  'src/services/engine/frame/visibleSlabBodies.ts',
  'src/layers/body/render/planetRenderer.ts',
  'src/services/engine/camera/cameraDrivers.ts',
  'src/services/camera/applyInputToCamera.ts',
  'src/utils/camera/computeViewProj.ts',
  'src/layers/galaxyCatalog/passes/galaxyPointSpritesPass.ts',
];

const WESL_FILES: readonly string[] = walkFiles('src/services/gpu/shaders/bodies', ['.wesl']);

// Files on the gated paths allowed to bridge Mpc<->m outside SEAM_FILES, and why. Each entry
// names its category so a NEW use needs its own line.
const SCALE_UNITS_ALLOW_LIST: ReadonlyMap<string, string> = new Map([
  [
    'src/layers/body/passes/earthPass.ts',
    'cull/fade precedent — bridges radiusM to Mpc to call the shared apparentSizePx sub-pixel cull and cloudDeckFade (both outside the body-slab path, both Mpc-shaped APIs)',
  ],
  [
    'src/layers/body/passes/surfaceTilesPass.ts',
    'fade precedent — bridges radiusM to Mpc for cloudDeckFade alone, so a patch and the base globe dissolve the deck shadow together (outside the body-slab path)',
  ],
  [
    'src/layers/body/passes/cloudShellPass.ts',
    'cull/fade precedent — bridges radiusM to Mpc for the same apparentSizePx cull and for cloudDeckFade (outside the body-slab path)',
  ],
  [
    'src/layers/body/passes/ringsPass.ts',
    'cull/fade precedent — bridges the ring outer radius/distance to Mpc to call the shared apparentSizePx sub-pixel cull (outside the body-slab path)',
  ],
  [
    'src/services/engine/frame/visibleSlabBodies.ts',
    'candidacy-math precedent — the pixel-floor/frustum roster gate runs entirely in Mpc (camPosMpc, positionMpc); ruled correct in radar-seams-tests.md finding 1, not a re-derivation of a slab MVP',
  ],
  [
    'src/layers/body/load/bodyTextureLoadRadius.ts',
    'candidacy-math precedent — converts a body radius to an Mpc load-distance threshold for the texture-demand gate, no slab MVP involved',
  ],
  [
    'src/services/engine/frame/meshBodyLoadRadius.ts',
    'candidacy-math precedent — same shape as bodyTextureLoadRadius.ts: converts a mesh body radius to an Mpc load-distance threshold for the mesh-demand gate, no slab MVP involved',
  ],
  [
    'src/layers/body/present/atmosphereDrawList.ts',
    'cull precedent — bridges radiusM to Mpc to call the shared apparentSizePx sub-pixel cull, same shape as earthPass/cloudShellPass',
  ],
  [
    'src/layers/starCatalog/passes/starSpheresPass.ts',
    "NEAR0 star-sphere precedent — scales a star's radiusM into the RENDER_ORIGIN_MPC-relative NEAR0 model matrix via composeBodyMvp, not the body-slab's composeBodySlabMvp",
  ],
  [
    'src/utils/star/starSphereRangeM.ts',
    "NEAR0 star-sphere precedent (spec §7.1) — folds a Mpc DISTANCE SCALAR (camera-to-sphere hypot) to metres for NEAR0's distanceRangeM, not a pose; the one exception spec §7.1 carves for the star-sphere interval",
  ],
  [
    'src/services/engine/frame/slabs.ts',
    "deriveSlabs is the seam's CALLER, not a second compose site: bodySlabRow's near/far/vp consume bodyRelativePose's already-metre-native pose untouched; its own MPC_TO_M/M_TO_MPC uses are COSMO's fixed distanceRangeM bracket and a body row's screen-footprint (radiusPx) bridge into bodyApparentDiameterPx — cull/fade precedent again, not pose math",
  ],
  [
    'src/services/engine/frame/deriveBodyStates.ts',
    "world-position precedent — phase 1c folds a surface site's AUTHORED metre offset (host radius + altitude) into the host's world Mpc position, the metres-in/Mpc-out boundary the authored table demands; no slab, no pose, no MVP",
  ],
  [
    'src/services/engine/camera/bodyLikeFraming.ts',
    'framing-bridge precedent — converts a body radius to Mpc so bodyFocusDistance and the returned FocusFraming.radius can compose with Mpc-shaped framing math (camera-pivot controller verification, spec §10), not a pose re-derivation',
  ],
  [
    'src/services/engine/frame/near0OverlayClipScale.ts',
    'clip-unit precedent — the factor is a UNIFORM RESCALE of the NEAR0 overlay clip space (NDC-invariant, keeping clip w off the rasterizer floor); it converts no pose and no position, and the anchors it projects stay in Mpc',
  ],
  [
    'src/services/engine/camera/pivotRadiusMpc.ts',
    "framing-bridge precedent — the SelectionRow's radiusM to Mpc bridge feeding clampDistance's floor argument (zoom floor, pinch floor, follow driver's distance target all derive from it), not a pose re-derivation",
  ],
  [
    'src/layers/blackHoles/present/blackHoleLensEnvelopeM.ts',
    'fade precedent — bridges a metre distance to Mpc only to test it against the capture band Mpc goneAt, no slab MVP involved',
  ],
]);

function scaleUnitsMembersUsed(file: string): string[] {
  const sourceFile = parseOnlyProject.addSourceFileAtPath(file);
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
  it('the directory sweep found real files, including each known anchor', () => {
    // A typo'd glob returns [] silently and every it.each would vacuously pass; 100 leaves
    // margin below the true count (~145 files).
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
      // The allow-list still asserts something: a file wrongly listed here (no actual use) fails this.
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
