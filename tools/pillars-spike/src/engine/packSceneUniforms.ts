/**
 * Pack the per-frame SceneUniforms (lib/scene.wesl). Byte layout mirror —
 * the WGSL struct's offsets restated as Float32Array indices:
 *
 *   [ 0..15] viewProj        [16..18] camPos    [19] timeSec
 *   [20..22] camRight        [23] tanHalfFov
 *   [24..26] camUp           [27] aspect
 *   [28..30] camFwd          [31] frame
 *   [32] densityMul  [33] emissionMul  [34] scatterMul  [35] ambientMul
 *   [36] starBrightness  [37] phaseG   [38..39] pad
 *
 * Writes into a caller-owned `out` (40 floats) so the frame loop reuses
 * one scratch array with zero per-frame allocation. Offsets are locked by
 * tests/tools/pillars-spike/engine/packSceneUniforms.test.ts — update the
 * WGSL struct, this packer, and that test together.
 */
export function packSceneUniforms(
  args: {
    viewProj: Float32Array;
    camPos: readonly [number, number, number];
    camRight: readonly [number, number, number];
    camUp: readonly [number, number, number];
    camFwd: readonly [number, number, number];
    tanHalfFov: number;
    aspect: number;
    timeSec: number;
    frame: number;
    densityMul: number;
    emissionMul: number;
    scatterMul: number;
    ambientMul: number;
    starBrightness: number;
    phaseG: number;
  },
  out: Float32Array,
): Float32Array {
  if (out.length < 40) {
    throw new Error(`SceneUniforms needs 40 floats, got ${out.length}`);
  }
  out.set(args.viewProj, 0);
  out[16] = args.camPos[0];
  out[17] = args.camPos[1];
  out[18] = args.camPos[2];
  out[19] = args.timeSec;
  out[20] = args.camRight[0];
  out[21] = args.camRight[1];
  out[22] = args.camRight[2];
  out[23] = args.tanHalfFov;
  out[24] = args.camUp[0];
  out[25] = args.camUp[1];
  out[26] = args.camUp[2];
  out[27] = args.aspect;
  out[28] = args.camFwd[0];
  out[29] = args.camFwd[1];
  out[30] = args.camFwd[2];
  out[31] = args.frame;
  out[32] = args.densityMul;
  out[33] = args.emissionMul;
  out[34] = args.scatterMul;
  out[35] = args.ambientMul;
  out[36] = args.starBrightness;
  out[37] = args.phaseG;
  out[38] = 0;
  out[39] = 0;
  return out;
}
