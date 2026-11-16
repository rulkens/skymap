/**
 * Every name a shader under `src/services/gpu/shaders/` declares (a `let`/`var`/`const`, a function
 * parameter, a `for (var …)` index) is longer than one letter, digit suffix or not: `s0`, `w2` and
 * `k` hide what a tap or weight holds, which the film-look review (2026-11-16) kept tripping over.
 * Struct members, swizzles, uses and comments don't count. `ALLOWED` is today's debt, keyed by file
 * with its offender count; counts only ever go DOWN, and a row whose file is clean (or gone) fails
 * until it is lowered or deleted.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_DIR = fileURLToPath(new URL('../../', import.meta.url));
const SHADERS = 'src/services/gpu/shaders';

// The bloom/* and compositor/fragment.wesl rows go when the film look (#1131) lands: it renames
// or cleans those files, and this test then names each row to delete.
const ALLOWED: Readonly<Record<string, number>> = {
  'src/services/gpu/shaders/additiveUpsample/fragment.wesl': 5,
  'src/services/gpu/shaders/additiveUpsample/vertex.wesl': 2,
  'src/services/gpu/shaders/atmosphere/aerialPerspective/bake.wesl': 5,
  'src/services/gpu/shaders/atmosphere/aerialPerspective/fragment.wesl': 8,
  'src/services/gpu/shaders/atmosphere/aerialPerspective/froxelSlices.wesl': 3,
  'src/services/gpu/shaders/atmosphere/multiScatterLut.wesl': 11,
  'src/services/gpu/shaders/atmosphere/scattering.wesl': 28,
  'src/services/gpu/shaders/atmosphere/shell/fragment.wesl': 3,
  'src/services/gpu/shaders/atmosphere/shell/vertex.wesl': 1,
  'src/services/gpu/shaders/atmosphere/skyViewLut.wesl': 7,
  'src/services/gpu/shaders/atmosphere/transmittanceLut.wesl': 5,
  'src/services/gpu/shaders/bloom/bright.wesl': 6,
  'src/services/gpu/shaders/bloom/downsample.wesl': 15,
  'src/services/gpu/shaders/bloom/fold.wesl': 3,
  'src/services/gpu/shaders/bloom/io.wesl': 2,
  'src/services/gpu/shaders/bloom/upsample.wesl': 4,
  'src/services/gpu/shaders/bodies/blackHoleLensing/fragment.wesl': 13,
  'src/services/gpu/shaders/bodies/blackHoleLensing/vertex.wesl': 1,
  'src/services/gpu/shaders/bodies/bodyGlint/fragment.wesl': 1,
  'src/services/gpu/shaders/bodies/bodyGlint/vertex.wesl': 1,
  'src/services/gpu/shaders/bodies/cloudShell/fragment.wesl': 2,
  'src/services/gpu/shaders/bodies/cloudShell/vertex.wesl': 1,
  'src/services/gpu/shaders/bodies/contactShadow/fragment.wesl': 4,
  'src/services/gpu/shaders/bodies/contactShadow/vertex.wesl': 2,
  'src/services/gpu/shaders/bodies/earth/fragment.wesl': 5,
  'src/services/gpu/shaders/bodies/earth/vertex.wesl': 1,
  'src/services/gpu/shaders/bodies/meshBody/fragment.wesl': 6,
  'src/services/gpu/shaders/bodies/meshBody/vertex.wesl': 1,
  'src/services/gpu/shaders/bodies/missionTrail/fragment.wesl': 1,
  'src/services/gpu/shaders/bodies/missionTrail/vertex.wesl': 4,
  'src/services/gpu/shaders/bodies/orbitTrail/fragment.wesl': 7,
  'src/services/gpu/shaders/bodies/orbitTrail/vertex.wesl': 2,
  'src/services/gpu/shaders/bodies/planet/fragment.wesl': 1,
  'src/services/gpu/shaders/bodies/ring/fragment.wesl': 6,
  'src/services/gpu/shaders/bodies/ring/vertex.wesl': 1,
  'src/services/gpu/shaders/bodies/spherePick.wesl': 1,
  'src/services/gpu/shaders/bodies/star/fragment.wesl': 1,
  'src/services/gpu/shaders/bodies/star/vertex.wesl': 1,
  'src/services/gpu/shaders/bodies/starPointPick.wesl': 1,
  'src/services/gpu/shaders/bodies/starPoints/fragment.wesl': 4,
  'src/services/gpu/shaders/bodies/starPoints/vertex.wesl': 2,
  'src/services/gpu/shaders/bodies/surfaceTile/fragmentBare.wesl': 4,
  'src/services/gpu/shaders/bodies/surfaceTile/fragmentEarth.wesl': 4,
  'src/services/gpu/shaders/bodies/surfaceTile/lattice.wesl': 7,
  'src/services/gpu/shaders/bodies/surfaceTile/surfaceLighting.wesl': 3,
  'src/services/gpu/shaders/bodies/surfaceTile/vertex.wesl': 14,
  'src/services/gpu/shaders/bodies/texturedBody/fragment.wesl': 7,
  'src/services/gpu/shaders/bodies/texturedBody/vertex.wesl': 1,
  'src/services/gpu/shaders/compositor/fragment.wesl': 1,
  'src/services/gpu/shaders/compositor/vertex.wesl': 2,
  'src/services/gpu/shaders/constellations/fragment.wesl': 1,
  'src/services/gpu/shaders/constellations/vertex.wesl': 2,
  'src/services/gpu/shaders/devTools/terrainPickMarker/fragment.wesl': 6,
  'src/services/gpu/shaders/devTools/terrainPickMarker/vertex.wesl': 1,
  'src/services/gpu/shaders/domeResample/fragment.wesl': 6,
  'src/services/gpu/shaders/filaments/fragment.wesl': 1,
  'src/services/gpu/shaders/filaments/vertex.wesl': 2,
  'src/services/gpu/shaders/flow/compute.wesl': 8,
  'src/services/gpu/shaders/flow/fragment.wesl': 1,
  'src/services/gpu/shaders/flow/vertex.wesl': 1,
  'src/services/gpu/shaders/galaxyCatalog/points/colorFragment.wesl': 1,
  'src/services/gpu/shaders/galaxyCatalog/points/vertex.wesl': 2,
  'src/services/gpu/shaders/galaxyCatalog/points/vertexBody.wesl': 2,
  'src/services/gpu/shaders/galaxyCatalog/proceduralDisks/fragment.wesl': 1,
  'src/services/gpu/shaders/galaxyCatalog/proceduralDisks/vertex.wesl': 1,
  'src/services/gpu/shaders/galaxyCatalog/texturedDisks/fragment.wesl': 2,
  'src/services/gpu/shaders/galaxyCatalog/texturedDisks/vertex.wesl': 1,
  'src/services/gpu/shaders/horizonShell/fragment.wesl': 3,
  'src/services/gpu/shaders/horizonShell/vertex.wesl': 2,
  'src/services/gpu/shaders/labels/pick.wesl': 1,
  'src/services/gpu/shaders/labels/vertex.wesl': 1,
  'src/services/gpu/shaders/labels3d/vertex.wesl': 1,
  'src/services/gpu/shaders/lib/analyticSphere.wesl': 6,
  'src/services/gpu/shaders/lib/camera.wesl': 4,
  'src/services/gpu/shaders/lib/cloudSprite.wesl': 6,
  'src/services/gpu/shaders/lib/colorIndex.wesl': 3,
  'src/services/gpu/shaders/lib/flow.wesl': 5,
  'src/services/gpu/shaders/lib/focusUniforms.wesl': 2,
  'src/services/gpu/shaders/lib/fresnel.wesl': 2,
  'src/services/gpu/shaders/lib/fullscreenTri.wesl': 2,
  'src/services/gpu/shaders/lib/gaussianIntegral.wesl': 15,
  'src/services/gpu/shaders/lib/masks.wesl': 1,
  'src/services/gpu/shaders/lib/math.wesl': 13,
  'src/services/gpu/shaders/lib/mipBlit.wesl': 2,
  'src/services/gpu/shaders/lib/msdf.wesl': 5,
  'src/services/gpu/shaders/lib/normalMap.wesl': 1,
  'src/services/gpu/shaders/lib/pbr.wesl': 36,
  'src/services/gpu/shaders/lib/sceneDepthRay.wesl': 4,
  'src/services/gpu/shaders/lib/segmentQuad.wesl': 6,
  'src/services/gpu/shaders/lib/splatSilhouette.wesl': 1,
  'src/services/gpu/shaders/lib/srgb.wesl': 1,
  'src/services/gpu/shaders/lib/starKnee.wesl': 1,
  'src/services/gpu/shaders/lib/starPhotometry.wesl': 1,
  'src/services/gpu/shaders/lib/tonemap.wesl': 13,
  'src/services/gpu/shaders/lib/trailOcclusion.wesl': 4,
  'src/services/gpu/shaders/lib/util.wesl': 26,
  'src/services/gpu/shaders/lib/volumeRaymarch.wesl': 2,
  'src/services/gpu/shaders/lightTime/fragment.wesl': 4,
  'src/services/gpu/shaders/lightTime/vertex.wesl': 2,
  'src/services/gpu/shaders/localBubble/shell.wesl': 3,
  'src/services/gpu/shaders/markerLines/vertex.wesl': 2,
  'src/services/gpu/shaders/mcpm/camera.wesl': 4,
  'src/services/gpu/shaders/mcpm/decay.wesl': 3,
  'src/services/gpu/shaders/mcpm/fragment.wesl': 9,
  'src/services/gpu/shaders/mcpm/galaxyPoints.wesl': 2,
  'src/services/gpu/shaders/mcpm/grid.wesl': 17,
  'src/services/gpu/shaders/mcpm/histogram.wesl': 3,
  'src/services/gpu/shaders/mcpm/propagate.wesl': 8,
  'src/services/gpu/shaders/mcpm/splatBlit.wesl': 1,
  'src/services/gpu/shaders/mcpm/splatTransform.wesl': 4,
  'src/services/gpu/shaders/mcpm/volpath.wesl': 25,
  'src/services/gpu/shaders/mcpm/volpathBlit.wesl': 2,
  'src/services/gpu/shaders/milkyWay/field/bubblePresent/fragment.wesl': 1,
  'src/services/gpu/shaders/milkyWay/field/bubblePresent/vertex.wesl': 1,
  'src/services/gpu/shaders/milkyWay/field/dustAttenuation.wesl': 2,
  'src/services/gpu/shaders/milkyWay/field/dustDetail.wesl': 2,
  'src/services/gpu/shaders/milkyWay/field/dustMap/fragment.wesl': 18,
  'src/services/gpu/shaders/milkyWay/field/dustMap/vertex.wesl': 1,
  'src/services/gpu/shaders/milkyWay/field/dustNoiseBake.wesl': 10,
  'src/services/gpu/shaders/milkyWay/field/dustPresent/fragment.wesl': 1,
  'src/services/gpu/shaders/milkyWay/field/fieldSplat/fragment.wesl': 2,
  'src/services/gpu/shaders/milkyWay/field/hiiSplat/erosionFragment.wesl': 2,
  'src/services/gpu/shaders/milkyWay/field/hiiSplat/extrasFragment.wesl': 2,
  'src/services/gpu/shaders/milkyWay/field/hiiSplat/hiiNoise.wesl': 3,
  'src/services/gpu/shaders/milkyWay/field/hiiSplat/shadeCommon.wesl': 2,
  'src/services/gpu/shaders/milkyWay/field/hiiSplat/starGrain.wesl': 3,
  'src/services/gpu/shaders/milkyWay/field/hiiSplat/youngFragment.wesl': 2,
  'src/services/gpu/shaders/milkyWay/field/io.wesl': 1,
  'src/services/gpu/shaders/milkyWay/field/starGrainBake.wesl': 7,
  'src/services/gpu/shaders/milkyWay/field/warpNoiseBake.wesl': 9,
  'src/services/gpu/shaders/milkyWay/ismMap/clusteredDiscPlacement.wesl': 19,
  'src/services/gpu/shaders/milkyWay/ismMap/ismMapCartesianBake.wesl': 1,
  'src/services/gpu/shaders/milkyWay/ismMap/ismMapDustBlur.wesl': 3,
  'src/services/gpu/shaders/milkyWay/ismMap/ismMapDustCdfScan.wesl': 3,
  'src/services/gpu/shaders/milkyWay/ismMap/ismMapFluidStep.wesl': 7,
  'src/services/gpu/shaders/milkyWay/ismMap/ismMapFluidVelocity.wesl': 25,
  'src/services/gpu/shaders/milkyWay/ismMap/ismMapOrientationCoherence.wesl': 1,
  'src/services/gpu/shaders/milkyWay/ismMap/ismMapOrientationField.wesl': 7,
  'src/services/gpu/shaders/milkyWay/ismMap/ismMapOrientationLib.wesl': 5,
  'src/services/gpu/shaders/milkyWay/ismMap/ismMapOrientationTensorBlur.wesl': 6,
  'src/services/gpu/shaders/milkyWay/ismMap/ismMapPresent.wesl': 3,
  'src/services/gpu/shaders/milkyWay/ismMap/ismMapPresentLib.wesl': 1,
  'src/services/gpu/shaders/milkyWay/ismMap/ismMapShear.wesl': 2,
  'src/services/gpu/shaders/milkyWay/ismMap/orientationPresent.wesl': 3,
  'src/services/gpu/shaders/milkyWay/ismMap/placeArmCloud.wesl': 2,
  'src/services/gpu/shaders/milkyWay/ismMap/placeArmSpurCloud.wesl': 2,
  'src/services/gpu/shaders/milkyWay/ismMap/placeDigVeil.wesl': 5,
  'src/services/gpu/shaders/milkyWay/ismMap/placeDust.wesl': 3,
  'src/services/gpu/shaders/milkyWay/ismMap/ringReduce.wesl': 3,
  'src/services/gpu/shaders/milkyWay/pick/pick.wesl': 1,
  'src/services/gpu/shaders/milkyWay/pick/vertex.wesl': 1,
  'src/services/gpu/shaders/milkyWay/sprites/dust.wesl': 5,
  'src/services/gpu/shaders/milkyWay/sprites/generate.wesl': 111,
  'src/services/gpu/shaders/milkyWay/sprites/generateDust.wesl': 1,
  'src/services/gpu/shaders/milkyWay/sprites/generateStars.wesl': 1,
  'src/services/gpu/shaders/milkyWay/sprites/io.wesl': 1,
  'src/services/gpu/shaders/milkyWay/sprites/stars.wesl': 5,
  'src/services/gpu/shaders/octree/cut.wesl': 15,
  'src/services/gpu/shaders/pickDebugOverlay/vertex.wesl': 2,
  'src/services/gpu/shaders/prefilterCube/prefilterCube.wesl': 9,
  'src/services/gpu/shaders/satellites/points/fragment.wesl': 1,
  'src/services/gpu/shaders/satellites/points/illumination.wesl': 4,
  'src/services/gpu/shaders/satellites/points/pick.wesl': 2,
  'src/services/gpu/shaders/satellites/points/project.wesl': 2,
  'src/services/gpu/shaders/satellites/points/vertex.wesl': 2,
  'src/services/gpu/shaders/scalarVolume/fragment.wesl': 4,
  'src/services/gpu/shaders/scalarVolume/vertex.wesl': 1,
  'src/services/gpu/shaders/selectionRing/fragment.wesl': 2,
  'src/services/gpu/shaders/starAggregateUpsample/fragment.wesl': 1,
  'src/services/gpu/shaders/starAggregateUpsample/vertex.wesl': 2,
  'src/services/gpu/shaders/starCatalog/fragment.wesl': 7,
  'src/services/gpu/shaders/starCatalog/pickFragment.wesl': 1,
  'src/services/gpu/shaders/starCatalog/vertex.wesl': 4,
  'src/services/gpu/shaders/stellarStreams/ribbonPick/vertex.wesl': 3,
  'src/services/gpu/shaders/stellarStreams/streaks/vertex.wesl': 1,
  'src/services/gpu/shaders/structureMarker/halo.wesl': 4,
  'src/services/gpu/shaders/structureMarker/ring.wesl': 3,
  'src/services/gpu/shaders/structureMarker/ringPick.wesl': 1,
  'src/services/gpu/shaders/zoneOfAvoidance/band.wesl': 5,
  'src/services/gpu/shaders/zoneOfAvoidance/fragment.wesl': 1,
  'src/services/gpu/shaders/zoneOfAvoidance/fragmentPick.wesl': 1,
  'src/services/gpu/shaders/zoneOfAvoidance/vertex.wesl': 2,
};

const ONE_LETTER = /^[A-Za-z][0-9]?$/;

// Blank comments out but keep their newlines, so offender line numbers still match the file.
const stripComments = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');

type Offender = { readonly line: number; readonly name: string };

function paramListAfter(src: string, open: number): string {
  let depth = 1;
  let end = open;
  while (depth > 0 && end < src.length) {
    if (src[end] === '(') depth++;
    else if (src[end] === ')') depth--;
    end++;
  }
  return src.slice(open, end - 1);
}

function offendersIn(src: string): Offender[] {
  const lineAt = (index: number): number => src.slice(0, index).split('\n').length;
  const declared = [
    ...src.matchAll(/(?<=\b(?:let|var|const)\b\s*(?:<[^>]*>\s*)?)[A-Za-z_]\w*/g),
  ].map((m) => ({ index: m.index, name: m[0] }));
  // A parameter is the identifier before a single `:` (`::` is a package path) in a fn's parens.
  const params = [...src.matchAll(/\bfn\s+\w+\s*\(/g)].flatMap((fn) => {
    const open = fn.index + fn[0].length;
    return [...paramListAfter(src, open).matchAll(/(?<![:\w])[A-Za-z_]\w*(?=\s*:(?!:))/g)].map(
      (m) => ({ index: open + m.index, name: m[0] }),
    );
  });
  return [...declared, ...params]
    .filter(({ name }) => ONE_LETTER.test(name))
    .map(({ index, name }) => ({ line: lineAt(index), name }));
}

// `Dirent.isFile()` is false for a symlink, so a linked shader is counted once, at its target.
function weslFilesUnder(dir: string): string[] {
  return readdirSync(`${REPO_DIR}${dir}`, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? weslFilesUnder(`${dir}/${e.name}`)
      : e.isFile() && e.name.endsWith('.wesl')
        ? [`${dir}/${e.name}`]
        : [],
  );
}

const offendersByFile = new Map(
  weslFilesUnder(SHADERS).map(
    (path) =>
      [path, offendersIn(stripComments(readFileSync(`${REPO_DIR}${path}`, 'utf8')))] as const,
  ),
);

it('every ALLOWED row names a .wesl file that still has one-letter names', () => {
  const stale = Object.keys(ALLOWED).filter((path) => !offendersByFile.get(path)?.length);
  expect(stale, 'ALLOWED rows whose file is clean or gone: remove the row').toEqual([]);
});

describe('.wesl declarations have names longer than one letter', () => {
  expect(offendersByFile.size).toBeGreaterThan(0);

  it.each([...offendersByFile])('%s', (path, offenders) => {
    const listed = offenders.map(({ line, name }) => `${path}:${line} ${name}`);
    const allowed = ALLOWED[path] ?? 0;
    if (offenders.length < allowed) {
      expect.fail(
        `${path} got cleaner: lower its ALLOWED row to ${offenders.length} (delete it at 0)`,
      );
    }
    expect(
      listed.length,
      `${path} declares one-letter names (rename them; see the wesl-shaders skill, "File layout"):\n` +
        listed.join('\n'),
    ).toBeLessThanOrEqual(allowed);
  });
});
