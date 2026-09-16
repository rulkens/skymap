/**
 * Parity guard: the flow-field constants mirrored into `flow/constants.wesl`
 * must equal the authoritative TS exports in `flowFieldConstants.ts`.
 * `?static` WESL linking does pure build-time linking with NO value
 * injection, so the shader-side subset is a hand-written mirror — a test,
 * not the compiler, keeps it from drifting (mirrors
 * `tests/data/selectionEncoding.test.ts`'s read-as-text/regex-extract
 * pattern). Path is resolved from `process.cwd()`, not `__dirname`, which
 * doesn't work under the Vite/Vitest ESM runner.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  TRAIL,
  LIFE,
  FADE,
  DENS_SCALE,
  SPEED_COLOR_MAX,
} from '../../../../src/data/flow/flowFieldConstants';
import { DUST_SURVIVAL_FLOOR_FRAC } from '../../../../src/services/engine/galaxyGenerator/v2/dustParticleCloud';
import { ISM_MAP_WORKGROUP_SIZE } from '../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import { SPLAT_CUT_SIGMA } from '../../../../src/services/engine/galaxyGenerator/v2/youngStarChain';
import { ISM_MAP_AMBIENT_DUST } from '../../../../src/utils/galaxy/ismMapAmbientDust';
import { ISM_MAP_FLUID_EVENT_STRIDE } from '../../../../src/services/gpu/renderers/galaxyField/ismMap/packIsmMapFluidEvents';
import { EARTH_SURFACE_PARAMS } from '../../../../src/data/bodies/earthSurfaceParams';
import {
  EARTH_SURFACE_TILE_MESH_RESOLUTION,
  EARTH_TILE_ATLAS_SIDE,
  EARTH_TILE_PX,
  SURFACE_TILE_SKIRT_DEPTH_FRACTION,
} from '../../../../src/data/bodies/earthTileParams';
import {
  HEIGHT_CODE_OFFSET_M,
  HEIGHT_CODE_STEP_M,
  HEIGHT_POSTS_PER_TILE,
} from '../../../../src/data/scene/heightTileFormat';
import { PROXY_SCALE } from '../../../../src/utils/scene/proxyScale';

/**
 * Extract every `const NAME: (u32|f32) = <number>;` from flow/constants.wesl.
 * Handles the `u`/`f` literal suffixes and float syntax (`8.0`, `1200.0`),
 * parsing with `parseFloat` so `32u` -> 32 and `1.4` -> 1.4 alike.
 */
function parseWeslConstants(): Map<string, number> {
  const path = join(process.cwd(), 'src/services/gpu/shaders/flow/constants.wesl');
  const text = readFileSync(path, 'utf-8');
  const re = /const\s+(\w+)\s*:\s*(?:u32|f32)\s*=\s*([0-9]+(?:\.[0-9]+)?)[uf]?\s*;/g;
  const map = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    map.set(m[1]!, parseFloat(m[2]!));
  }
  return map;
}

describe('flow/constants.wesl ↔ flowFieldConstants.ts parity', () => {
  it('each WESL constant matches the TS export of the same name', () => {
    const wesl = parseWeslConstants();
    const cases: Array<[string, number]> = [
      ['TRAIL', TRAIL],
      ['LIFE', LIFE],
      ['FADE', FADE],
      ['DENS_SCALE', DENS_SCALE],
      ['SPEED_COLOR_MAX', SPEED_COLOR_MAX],
    ];
    for (const [name, tsValue] of cases) {
      const weslValue = wesl.get(name);
      expect(weslValue, `WESL constant ${name} is missing from flow/constants.wesl`).toBeDefined();
      expect(weslValue, `WESL ${name} (${weslValue}) does not match TS ${name} (${tsValue})`).toBe(
        tsValue,
      );
    }
  });

  it('every WESL constant has a corresponding TS export (no orphans)', () => {
    const wesl = parseWeslConstants();
    const known = new Set(['TRAIL', 'LIFE', 'FADE', 'DENS_SCALE', 'SPEED_COLOR_MAX']);
    for (const name of wesl.keys()) {
      expect(known.has(name), `flow/constants.wesl declares ${name} with no asserted TS twin`).toBe(
        true,
      );
    }
  });
});

/**
 * ismMap's grid dims (AZ/RINGS) size the texture and every pass reads them
 * back via `textureDimensions` — no WGSL mirror, so no parity test for them.
 * `@workgroup_size(16, 16)` is different: WGSL requires it as a compile-time
 * literal, so it genuinely stays duplicated across every ismMap compute entry
 * point rather than a single named const. This guards THAT duplication
 * against `ISM_MAP_WORKGROUP_SIZE` (`galaxyIsmMapArmForcing.ts`, which the
 * ISM-map orientation/fluid runners also use for dispatch-count math).
 */
describe('ismMap @workgroup_size(N, N) ↔ ISM_MAP_WORKGROUP_SIZE parity', () => {
  const files = [
    'src/services/gpu/shaders/milkyWay/ismMap/ismMapFluidStep.wesl',
    'src/services/gpu/shaders/milkyWay/ismMap/ismMapFluidPack.wesl',
    'src/services/gpu/shaders/milkyWay/ismMap/ismMapOrientationField.wesl',
    'src/services/gpu/shaders/milkyWay/ismMap/ismMapOrientationTensor.wesl',
    'src/services/gpu/shaders/milkyWay/ismMap/ismMapOrientationTensorBlur.wesl',
    'src/services/gpu/shaders/milkyWay/ismMap/ismMapOrientationCoherence.wesl',
    'src/services/gpu/shaders/milkyWay/ismMap/ismMapCartesianBake.wesl',
  ];

  it('every ismMap compute entry point declares a square workgroup matching ISM_MAP_WORKGROUP_SIZE', () => {
    const re = /@workgroup_size\((\d+),\s*(\d+)\)/g;
    let matchCount = 0;
    for (const file of files) {
      const text = readFileSync(join(process.cwd(), file), 'utf-8');
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        matchCount += 1;
        expect(m[1], `${file}: workgroup_size(${m[1]}, ${m[2]}) is not square`).toBe(m[2]);
        expect(
          parseInt(m[1]!, 10),
          `${file}: workgroup_size ${m[1]} does not match ISM_MAP_WORKGROUP_SIZE (${ISM_MAP_WORKGROUP_SIZE})`,
        ).toBe(ISM_MAP_WORKGROUP_SIZE);
      }
    }
    expect(matchCount, 'no @workgroup_size(N, N) found in the ismMap shader chain').toBeGreaterThan(
      0,
    );
  });
});

/**
 * ISM_MAP_AMBIENT_DUST (ismMapAmbientDust.ts) is mirrored into three WESL
 * files that are not dedicated constant-mirror files, so — same idiom as
 * bloomSeedingConstants.parity.test.ts's readWeslConst — this reads one
 * named const per file rather than sweeping each for orphans.
 * ismMapFluidStep.wesl seeds every texel to this pedestal, scaled by its own
 * radial gasProfile(r), at step 0; ismMapDustBlur.wesl and
 * ismMapCartesianBake.wesl must both subtract the SAME pedestal, or S4's
 * detail ratio (computed once by the bake, shared by every consumer) drifts
 * against its own blur divisor. ismMapPresent.wesl does not subtract it: its
 * "seeding" debug view reads the map's raw dust channel directly — the
 * pedestal is seeded `ambient * gasProfile(r)` and advected, so it's
 * structure, not a floor to clear (see dustParticleCloud.ts's
 * DUST_SURVIVAL_FLOOR_FRAC doc).
 */
function readWeslConst(relPath: string, name: string): number | undefined {
  const text = readFileSync(join(process.cwd(), relPath), 'utf-8');
  const re = /const\s+(\w+)\s*:\s*(?:u32|f32)\s*=\s*(-?[0-9]+(?:\.[0-9]+)?)[uf]?\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1] === name) return parseFloat(m[2]!);
  }
  return undefined;
}

describe('ISM_MAP_AMBIENT_DUST parity (ismMapAmbientDust.ts ↔ its WESL mirrors)', () => {
  const files = [
    'src/services/gpu/shaders/milkyWay/ismMap/ismMapFluidStep.wesl',
    'src/services/gpu/shaders/milkyWay/ismMap/ismMapDustBlur.wesl',
    'src/services/gpu/shaders/milkyWay/ismMap/ismMapCartesianBake.wesl',
  ];

  it("each file's ISM_MAP_AMBIENT_DUST equals the TS export", () => {
    for (const file of files) {
      const weslValue = readWeslConst(file, 'ISM_MAP_AMBIENT_DUST');
      expect(weslValue, `ISM_MAP_AMBIENT_DUST is missing from ${file}`).toBeDefined();
      expect(
        weslValue,
        `${file}: WESL ISM_MAP_AMBIENT_DUST (${weslValue}) does not match TS ISM_MAP_AMBIENT_DUST (${ISM_MAP_AMBIENT_DUST})`,
      ).toBe(ISM_MAP_AMBIENT_DUST);
    }
  });
});

/**
 * DUST_SURVIVAL_FLOOR_FRAC (dustParticleCloud.ts) is mirrored into
 * ismMapPresent.wesl's "seeding" debug view (so a texel that would never
 * keep a map-seeded particle past S3's alive gate never glows in the view
 * either) AND into placeDust.wesl's own survival-floor gate (the actual
 * GPU placement, not just its debug view) — same `readWeslConst` idiom as
 * ISM_MAP_AMBIENT_DUST above, extended to a `files` loop for the same
 * reason: two independent hand mirrors, either can drift on its own.
 */
describe('DUST_SURVIVAL_FLOOR_FRAC parity (dustParticleCloud.ts ↔ its WESL mirrors)', () => {
  const files = [
    'src/services/gpu/shaders/milkyWay/ismMap/ismMapPresent.wesl',
    'src/services/gpu/shaders/milkyWay/ismMap/placeDust.wesl',
  ];

  it("each file's DUST_SURVIVAL_FLOOR_FRAC equals the TS export", () => {
    for (const file of files) {
      const weslValue = readWeslConst(file, 'DUST_SURVIVAL_FLOOR_FRAC');
      expect(weslValue, `DUST_SURVIVAL_FLOOR_FRAC is missing from ${file}`).toBeDefined();
      expect(
        weslValue,
        `${file}: WESL DUST_SURVIVAL_FLOOR_FRAC (${weslValue}) does not match TS DUST_SURVIVAL_FLOOR_FRAC (${DUST_SURVIVAL_FLOOR_FRAC})`,
      ).toBe(DUST_SURVIVAL_FLOOR_FRAC);
    }
  });
});

/**
 * SPLAT_CUT_SIGMA (youngStarChain.ts) mirrors splatSilhouette.wesl's own
 * SPLAT_CUT — the young-stars chain under-bounds its quad to
 * YOUNG_BOUND_SIGMA/SPLAT_CUT_SIGMA of the shader's cut, so a drift here
 * would silently change which sigma the truncation actually lands at.
 */
describe('SPLAT_CUT_SIGMA parity (youngStarChain.ts ↔ splatSilhouette.wesl)', () => {
  it("youngStarChain.ts's SPLAT_CUT_SIGMA equals splatSilhouette.wesl's SPLAT_CUT", () => {
    const file = 'src/services/gpu/shaders/lib/splatSilhouette.wesl';
    const weslValue = readWeslConst(file, 'SPLAT_CUT');
    expect(weslValue, `SPLAT_CUT is missing from ${file}`).toBeDefined();
    expect(
      weslValue,
      `${file}: WESL SPLAT_CUT (${weslValue}) does not match TS SPLAT_CUT_SIGMA (${SPLAT_CUT_SIGMA})`,
    ).toBe(SPLAT_CUT_SIGMA);
  });
});

/**
 * ISM_MAP_FLUID_EVENT_STRIDE (packIsmMapFluidEvents.ts) mirrors
 * ismMapFluidVelocity.wesl's own EVENT_STRIDE — the packer flattens each
 * event into that many floats and ismMapFluidStep.wesl's storage-buffer read
 * (`events[base + N]`) trusts the same stride, so a drift ships silently
 * misaligned event records to the GPU.
 */
describe('ISM_MAP_FLUID_EVENT_STRIDE parity (packIsmMapFluidEvents.ts ↔ ismMapFluidVelocity.wesl)', () => {
  it("ismMapFluidVelocity.wesl's EVENT_STRIDE equals the TS export", () => {
    const file = 'src/services/gpu/shaders/milkyWay/ismMap/ismMapFluidVelocity.wesl';
    const weslValue = readWeslConst(file, 'EVENT_STRIDE');
    expect(weslValue, `EVENT_STRIDE is missing from ${file}`).toBeDefined();
    expect(
      weslValue,
      `${file}: WESL EVENT_STRIDE (${weslValue}) does not match TS ISM_MAP_FLUID_EVENT_STRIDE (${ISM_MAP_FLUID_EVENT_STRIDE})`,
    ).toBe(ISM_MAP_FLUID_EVENT_STRIDE);
  });
});

/**
 * EARTH_TILE_ATLAS_SIDE (earthTileParams.ts) is mirrored into
 * earthSurfaceTile/surfaceLighting.wesl to derive the half-atlas-texel inset (C3)
 * that keeps a resolved tile rect's bilinear sampling from crossing into a
 * neighbour slot's pixels — a drift here would silently widen or shrink
 * that guard band against the atlas's real physical size.
 */
describe('EARTH_TILE_ATLAS_SIDE parity (earthTileParams.ts ↔ earthSurfaceTile/surfaceLighting.wesl)', () => {
  it("surfaceLighting.wesl's EARTH_TILE_ATLAS_SIDE equals the TS export", () => {
    const file = 'src/services/gpu/shaders/bodies/earthSurfaceTile/surfaceLighting.wesl';
    const weslValue = readWeslConst(file, 'EARTH_TILE_ATLAS_SIDE');
    expect(weslValue, `EARTH_TILE_ATLAS_SIDE is missing from ${file}`).toBeDefined();
    expect(
      weslValue,
      `${file}: WESL EARTH_TILE_ATLAS_SIDE (${weslValue}) does not match TS EARTH_TILE_ATLAS_SIDE (${EARTH_TILE_ATLAS_SIDE})`,
    ).toBe(EARTH_TILE_ATLAS_SIDE);
  });
});

/**
 * EARTH_TILE_PX (earthTileParams.ts) is mirrored into
 * earthSurfaceTile/surfaceLighting.wesl to derive TILE_SLOT_SCALE, the atlas-uv
 * width of a tile drawn from its own slot with no ancestor fallback — the
 * `earth-lod-overlay` toggle divides a resolved rect's actual width into
 * this to recover how many pyramid levels the fallback walked. A drift here
 * would silently mis-band every overlay tint.
 */
describe('EARTH_TILE_PX parity (earthTileParams.ts ↔ earthSurfaceTile/surfaceLighting.wesl)', () => {
  it("surfaceLighting.wesl's EARTH_TILE_PX equals the TS export", () => {
    const file = 'src/services/gpu/shaders/bodies/earthSurfaceTile/surfaceLighting.wesl';
    const weslValue = readWeslConst(file, 'EARTH_TILE_PX');
    expect(weslValue, `EARTH_TILE_PX is missing from ${file}`).toBeDefined();
    expect(
      weslValue,
      `${file}: WESL EARTH_TILE_PX (${weslValue}) does not match TS EARTH_TILE_PX (${EARTH_TILE_PX})`,
    ).toBe(EARTH_TILE_PX);
  });
});

/**
 * Both shader stages read their cell count from the instance record's
 * `heightCells` (R14), so neither mirrors HEIGHT_POSTS_PER_TILE any more. What
 * still has to hold is that a leaf drawing its OWN tile lands every template
 * vertex exactly on a post: a fractional stride there would put the two sides
 * of an LOD boundary on lattice points they cannot share.
 */
describe('HEIGHT_POSTS_PER_TILE vs the template (heightTileFormat.ts ↔ earthTileParams.ts)', () => {
  it('the post stride per template cell is integral', () => {
    expect((HEIGHT_POSTS_PER_TILE - 1) % EARTH_SURFACE_TILE_MESH_RESOLUTION).toBe(0);
  });
});

/**
 * SURFACE_TILE_SKIRT_DEPTH_FRACTION (earthTileParams.ts) is the eye-check's one
 * tuning knob for the skirt ring (F2-R3), and the vertex stage is its only
 * consumer — so without this guard the TS export is a knob that turns nothing.
 */
describe('SURFACE_TILE_SKIRT_DEPTH_FRACTION parity (earthTileParams.ts ↔ earthSurfaceTile/vertex.wesl)', () => {
  it("vertex.wesl's SURFACE_TILE_SKIRT_DEPTH_FRACTION equals the TS export", () => {
    const file = 'src/services/gpu/shaders/bodies/earthSurfaceTile/vertex.wesl';
    const weslValue = readWeslConst(file, 'SURFACE_TILE_SKIRT_DEPTH_FRACTION');
    expect(weslValue, `SURFACE_TILE_SKIRT_DEPTH_FRACTION is missing from ${file}`).toBeDefined();
    expect(
      weslValue,
      `${file}: WESL SURFACE_TILE_SKIRT_DEPTH_FRACTION (${weslValue}) does not match TS SURFACE_TILE_SKIRT_DEPTH_FRACTION (${SURFACE_TILE_SKIRT_DEPTH_FRACTION})`,
    ).toBe(SURFACE_TILE_SKIRT_DEPTH_FRACTION);
  });
});

/**
 * PROXY_SCALE (proxyScale.ts) mirrors analyticSphere.wesl's own PROXY_SCALE —
 * `bodySlabRow` (slabs.ts) needs the same inflation factor CPU-side to size a
 * body row's near-plane margin, so a rasterised proxy vertex can never fall
 * in front of the plane meant to contain it (the Saturn-vanish investigation,
 * .superpowers/sdd/2026-08-26-body-render-slabs/).
 */
describe('PROXY_SCALE parity (proxyScale.ts ↔ analyticSphere.wesl)', () => {
  it("analyticSphere.wesl's PROXY_SCALE equals the TS export", () => {
    const file = 'src/services/gpu/shaders/lib/analyticSphere.wesl';
    const weslValue = readWeslConst(file, 'PROXY_SCALE');
    expect(weslValue, `PROXY_SCALE is missing from ${file}`).toBeDefined();
    expect(
      weslValue,
      `${file}: WESL PROXY_SCALE (${weslValue}) does not match TS PROXY_SCALE (${PROXY_SCALE})`,
    ).toBe(PROXY_SCALE);
  });
});

/**
 * One unit for the probe and the direct term: the mesh body's probe captures
 * the planets in `litShade` units, so the Sun's irradiance on the mesh is a
 * WESL const mirroring `EARTH_SURFACE_PARAMS.sunIrradiance` rather than a
 * uniform. A drift here makes a metal reflect its host at a brightness the
 * direct highlight no longer matches.
 */
describe('SUN_IRRADIANCE parity (earthSurfaceParams.ts ↔ meshBody/fragment.wesl)', () => {
  it("meshBody/fragment.wesl's SUN_IRRADIANCE equals EARTH_SURFACE_PARAMS.sunIrradiance", () => {
    const file = 'src/services/gpu/shaders/bodies/meshBody/fragment.wesl';
    const weslValue = readWeslConst(file, 'SUN_IRRADIANCE');
    expect(weslValue, `SUN_IRRADIANCE is missing from ${file}`).toBeDefined();
    expect(
      weslValue,
      `${file}: WESL SUN_IRRADIANCE (${weslValue}) does not match TS EARTH_SURFACE_PARAMS.sunIrradiance (${EARTH_SURFACE_PARAMS.sunIrradiance})`,
    ).toBe(EARTH_SURFACE_PARAMS.sunIrradiance);
  });
});

/**
 * The shader decodes Terrain-RGB heights itself (`postHeightM`), so a drift in
 * either number shifts or scales every displaced vertex against the CPU's
 * subtree bounds, which the walk's cull headroom is built from.
 */
describe('Terrain-RGB height code parity (heightTileFormat.ts ↔ earthSurfaceTile/lattice.wesl)', () => {
  it.each([
    ['HEIGHT_CODE_OFFSET_M', HEIGHT_CODE_OFFSET_M],
    ['HEIGHT_CODE_STEP_M', HEIGHT_CODE_STEP_M],
  ])("lattice.wesl's %s equals the TS export", (name, tsValue) => {
    const file = 'src/services/gpu/shaders/bodies/earthSurfaceTile/lattice.wesl';
    expect(readWeslConst(file, name), `${file}: ${name}`).toBe(tsValue);
  });
});
