/**
 * SgrAStarLensingUniforms WESL<->packer parity — nothing previously read the
 * WGSL struct itself, so a field reorder in `sgrAStarLensing.wesl` (a field
 * inserted ahead of `anchorPosRelCamM`, say) would drift silently past
 * `packSgrAStarLensingUniforms.test.ts` (which only re-asserts the packer's
 * own documented offsets against itself) and hand the GPU a shifted struct.
 * This parses `struct SgrAStarLensingUniforms` out of the .wesl file, derives
 * its std140 float offsets, then drives the REAL packer with a distinct
 * sentinel per field and asserts each sentinel lands where the struct — not
 * the packer — says it should. Follows the `atmosphereUniformsLayout.parity
 * .test.ts` / `nodeParamsLayout.test.ts` precedent for locating/parsing the
 * struct and computing WGSL alignment; the embedded `cam: CameraUniforms`
 * prefix is treated as an opaque 80-byte block (its own byte-for-byte parity
 * lives in `cameraUniforms.test.ts` and this file's sibling
 * `packSgrAStarLensingUniforms.test.ts`, which both cover its content).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  packSgrAStarLensingUniforms,
  SGR_A_STAR_LENSING_UNIFORM_FLOATS,
} from '../../../src/utils/gpu/packSgrAStarLensingUniforms';
import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const weslPath = resolve(repoRoot, 'src/services/gpu/shaders/lib/sgrAStarLensing.wesl');

/** std140 alignment + size for the types SgrAStarLensingUniforms uses.
 *  `lanes: 0` marks the embedded `CameraUniforms` prefix — its block offset
 *  still comes from this table (it advances the cursor 80 bytes), but its
 *  content is not asserted here; see the module header for why. */
const WESL_TYPES: Record<string, { align: number; size: number; lanes: number }> = {
  f32: { align: 4, size: 4, lanes: 1 },
  'vec3<f32>': { align: 16, size: 12, lanes: 3 },
  CameraUniforms: { align: 16, size: 80, lanes: 0 },
};

function roundUp(value: number, align: number): number {
  return Math.ceil(value / align) * align;
}

function structFields(source: string, name: string): Array<{ name: string; type: string }> {
  const body = source.match(new RegExp(`struct\\s+${name}\\s*\\{([^}]*)\\}`))?.[1];
  if (!body) throw new Error(`struct ${name} not found in sgrAStarLensing.wesl`);
  return body
    .split(',')
    .map((line) => line.replace(/\/\/.*$/gm, '').trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [fieldName, type] = line.split(':').map((part) => part.trim());
      if (!fieldName || !type)
        throw new Error(`unparsable SgrAStarLensingUniforms field: '${line}'`);
      return { name: fieldName, type };
    });
}

type FieldLayout = { name: string; floatOffset: number; lanes: number };

/** Std140 layout, in declaration order, converted to float indices (every
 *  member here is 4-byte aligned, so bytes/4 is exact). */
function structLayout(fields: Array<{ name: string; type: string }>): {
  layout: FieldLayout[];
  totalFloats: number;
} {
  const layout: FieldLayout[] = [];
  let cursor = 0;
  let maxAlign = 4;
  for (const { name, type } of fields) {
    const spec = WESL_TYPES[type];
    if (!spec) throw new Error(`unhandled WESL type '${type}' on field ${name}`);
    const offset = roundUp(cursor, spec.align);
    layout.push({ name, floatOffset: offset / 4, lanes: spec.lanes });
    cursor = offset + spec.size;
    maxAlign = Math.max(maxAlign, spec.align);
  }
  return { layout, totalFloats: roundUp(cursor, maxAlign) / 4 };
}

describe('SgrAStarLensingUniforms WESL/packer parity', () => {
  const wesl = readFileSync(weslPath, 'utf8');
  const { layout, totalFloats } = structLayout(structFields(wesl, 'SgrAStarLensingUniforms'));

  it('struct float count matches SGR_A_STAR_LENSING_UNIFORM_FLOATS', () => {
    expect(totalFloats).toBe(SGR_A_STAR_LENSING_UNIFORM_FLOATS);
  });

  it('the real packer writes each field at the offset the struct declares', () => {
    // One non-overlapping sentinel per field, so a swap between any two
    // fields — or a packer that missed a WESL reorder — lands a recognisable
    // value at the WRONG offset instead of matching by luck. The cam prefix's
    // own inputs are unchecked here (see module header), so any distinct
    // values will do.
    const viewProj = Float32Array.from({ length: 16 }, (_, i) => i + 1); // 1..16
    const viewportPx: Vec2 = [17, 18];
    const schwarzschildRadiusM = 501;
    const innerRs = 502;
    const outerRs = 503;
    const inclinationRad = 504;
    const positionAngleRad = 505;
    const flickerAmp = 506;
    const flickerTimescaleS = 507;
    const flickerPhase = 508;
    const lutMinImpactParamRs = 509;
    const lutMaxImpactParamRs = 510;
    const lutSampleCount = 511;
    const bandAlpha = 512;
    const anchorPosRelCamM: Vec3 = [601, 602, 603];
    // T15 TEMP tuning-knob fields — deleted along with these sentinels at the
    // removal step once Task 17 converges.
    const diskScaleHeightRs = 701;
    const edgeFadeStartFraction = 702;
    const dopplerStrength = 703;
    const emissionStrength = 704;
    const edgeFadeEndRs = 705;
    const emissionTint: Vec3 = [801, 802, 803];

    const rec = packSgrAStarLensingUniforms(
      viewProj,
      viewportPx,
      schwarzschildRadiusM,
      innerRs,
      outerRs,
      inclinationRad,
      positionAngleRad,
      flickerAmp,
      flickerTimescaleS,
      flickerPhase,
      lutMinImpactParamRs,
      lutMaxImpactParamRs,
      lutSampleCount,
      bandAlpha,
      anchorPosRelCamM,
      diskScaleHeightRs,
      edgeFadeStartFraction,
      dopplerStrength,
      emissionStrength,
      edgeFadeEndRs,
      emissionTint,
    );

    const vectorByField: Record<string, Vec3> = { anchorPosRelCamM, emissionTint };
    const scalarByField: Record<string, number> = {
      schwarzschildRadiusM,
      innerRs,
      outerRs,
      inclinationRad,
      positionAngleRad,
      flickerAmp,
      flickerTimescaleS,
      flickerPhase,
      lutMinImpactParamRs,
      lutMaxImpactParamRs,
      lutSampleCount,
      bandAlpha,
      diskScaleHeightRs,
      edgeFadeStartFraction,
      dopplerStrength,
      emissionStrength,
      edgeFadeEndRs,
    };
    const zeroPadFields = new Set(['_pad5']);

    for (const field of layout) {
      if (field.lanes === 0) {
        // The opaque cam: CameraUniforms prefix — content unchecked here.
        continue;
      } else if (field.lanes === 3) {
        const vec = vectorByField[field.name];
        if (!vec) throw new Error(`no sentinel vector for field '${field.name}'`);
        for (let lane = 0; lane < 3; lane++) expect(rec[field.floatOffset + lane]).toBe(vec[lane]);
      } else if (zeroPadFields.has(field.name)) {
        expect(rec[field.floatOffset]).toBe(0);
      } else {
        const value = scalarByField[field.name];
        if (value === undefined) throw new Error(`no sentinel for field '${field.name}'`);
        expect(rec[field.floatOffset]).toBe(value);
      }
    }
  });
});
