/**
 * BlackHoleLensingUniforms WESL<->packer parity — nothing else reads the WGSL
 * struct itself, so a field reorder in `blackHoleLensing.wesl` (a field
 * inserted ahead of `anchorPosRelCamM`, say) would drift silently past a
 * packer test asserting only its own documented offsets and hand the GPU a
 * shifted struct. This lays out `struct BlackHoleLensingUniforms` from the
 * .wesl file, then drives the REAL packer with a distinct sentinel per field
 * and asserts each sentinel lands where the struct — not the packer — says it
 * should. The embedded `cam: CameraUniforms` prefix is an opaque block here;
 * `viewBasis` (mat3x3) is checked column by column, each padded to 16 bytes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  packBlackHoleLensingUniforms,
  BLACK_HOLE_LENSING_UNIFORM_FLOATS,
} from '../../../../../src/layers/blackHoles/lensing/render/packBlackHoleLensingUniforms';
import type { Vec2 } from '../../../../../packages/shared/src/@types/math/Vec2';
import type { Vec3 } from '../../../../../packages/shared/src/@types/math/Vec3';
import type { Mat3 } from '../../../../../src/@types/math/Mat3';
import { weslStructLayout } from '../../../../helpers/wesl/weslStructLayout';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../..');
const weslPath = resolve(repoRoot, 'src/services/gpu/shaders/lib/blackHoleLensing.wesl');

describe('BlackHoleLensingUniforms WESL/packer parity', () => {
  const wesl = readFileSync(weslPath, 'utf8');
  const struct = weslStructLayout(wesl, 'BlackHoleLensingUniforms', 'uniform');
  const totalFloats = struct.size / 4;

  it('struct float count matches BLACK_HOLE_LENSING_UNIFORM_FLOATS', () => {
    expect(totalFloats).toBe(BLACK_HOLE_LENSING_UNIFORM_FLOATS);
  });

  it('the real packer writes each field at the offset the struct declares', () => {
    // One non-overlapping sentinel per field, so a swap between any two
    // fields — or a packer that missed a WESL reorder — lands a recognisable
    // value at the WRONG offset instead of matching by luck. The cam prefix's
    // own inputs are unchecked here (see module header), so any distinct
    // values will do.
    const viewProj = Float32Array.from({ length: 16 }, (_, i) => i + 1); // 1..16
    const viewportPx: Vec2 = [17, 18];
    const pxPerRad = 19;
    const schwarzschildRadiusM = 501;
    const innerRs = 502;
    const outerRs = 503;
    const inclinationRad = 504;
    const positionAngleRad = 505;
    const flickerAmp = 506;
    const flickerPhase = 508;
    const lutMinImpactParamRs = 509;
    const lutMaxImpactParamRs = 510;
    const lutSampleCount = 511;
    const bandAlpha = 512;
    const anchorPosRelCamM: Vec3 = [601, 602, 603];
    // Tuning-knob fields.
    const diskScaleHeightRs = 701;
    const edgeFadeStartFraction = 702;
    const dopplerStrength = 703;
    const emissionStrength = 704;
    const edgeFadeEndRs = 705;
    const emissionTint: Vec3 = [801, 802, 803];
    // This view's camera basis + frustum tangents.
    const viewBasis: Mat3 = [901, 902, 903, 904, 905, 906, 907, 908, 909];
    const frustum = { tanLeft: 910, tanRight: 911, tanDown: 912, tanUp: 913 };

    const rec = packBlackHoleLensingUniforms({
      viewProj,
      viewportPx,
      pxPerRad,
      schwarzschildRadiusM,
      innerRs,
      outerRs,
      inclinationRad,
      positionAngleRad,
      flickerAmp,
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
      viewBasis,
      frustum,
    });

    const vectorByField: Record<string, Vec3> = { anchorPosRelCamM, emissionTint };
    const vec4ByField: Record<string, readonly [number, number, number, number]> = {
      frustumTan: [frustum.tanLeft, frustum.tanRight, frustum.tanDown, frustum.tanUp],
    };
    const mat3ByField: Record<string, Mat3> = { viewBasis };
    const scalarByField: Record<string, number> = {
      schwarzschildRadiusM,
      innerRs,
      outerRs,
      inclinationRad,
      positionAngleRad,
      flickerAmp,
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
    // `_pad0`/`_pad1` are unwritten — `_pad0` because flickerTimescaleS lives
    // CPU-side (blackHoleLensingPass.ts's flickerPhase precompute) and is
    // never sampled by the shader; `_pad1` is unread.
    const zeroPadFields = new Set<string>(['_pad0', '_pad1']);

    for (const { name, type, offset } of struct.fields) {
      const field = { name, floatOffset: offset / 4 };
      if (type === 'CameraUniforms') {
        // The opaque cam: CameraUniforms prefix — content unchecked here.
        continue;
      } else if (type === 'mat3x3<f32>') {
        // mat3x3<f32>: three columns, each its own 16-byte (4-float) slot —
        // lane 3 of every column is std140 padding, never written.
        const mat = mat3ByField[field.name];
        if (!mat) throw new Error(`no sentinel matrix for field '${field.name}'`);
        for (let col = 0; col < 3; col++) {
          for (let row = 0; row < 3; row++) {
            expect(rec[field.floatOffset + col * 4 + row]).toBe(mat[col * 3 + row]);
          }
          expect(rec[field.floatOffset + col * 4 + 3]).toBe(0);
        }
      } else if (type === 'vec4<f32>') {
        const vec = vec4ByField[field.name];
        if (!vec) throw new Error(`no sentinel vec4 for field '${field.name}'`);
        for (let lane = 0; lane < 4; lane++) expect(rec[field.floatOffset + lane]).toBe(vec[lane]);
      } else if (type === 'vec3<f32>') {
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
