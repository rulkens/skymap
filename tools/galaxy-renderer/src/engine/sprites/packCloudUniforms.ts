/**
 * packCloudUniforms — the 208-byte uniform packer for the star + dust
 * billboard passes, matching `milkyWayCloud/io.wesl`'s `Uniforms` struct
 * byte-for-byte.
 *
 * ## Why the tool packs the APP's struct
 *
 * The two passes are now literally the app's shaders (`milkyWayCloud/`,
 * symlinked into this tool's WESL root — see `wesl.toml`), so the uniform
 * layout is not a choice this tool gets to make: `io.wesl` declares the single
 * `@group(0) @binding(0)` binding both passes read, and its module header
 * carries the canonical byte table. THAT HEADER IS THE OFFSET AUTHORITY. Every
 * index written below is quoted from it, and it is the file to reread before
 * touching any of them — a wrong index produces no error, just silently
 * garbage uniforms.
 *
 * The app's own packer is `milkyWayCloudRenderer.ts`'s `writeUniforms`. It is
 * mirrored rather than shared for one reason: it hard-codes
 * `MILKY_WAY_MODEL_SCALE` into the `modelScale` lane, because the app places
 * the generated cloud into a Mpc-scaled scene. This tool renders the cloud in
 * its own generated local space, so its `model` is the identity and its
 * `modelScale` is 1 — sharing would mean parameterising the app's draw args.
 * What CAN be shared is shared: the camera prefix (`writeCameraPrefix`, the
 * same writer every runtime renderer uses for floats 0..17) and the buffer
 * size (`MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE`), so only the tail floats are
 * mirrored here.
 *
 * ## Where the billboard basis comes from
 *
 * `camRight`/`camUp` are the camera's WORLD-space right/up axes, needed
 * because each instance is expanded on the GPU into a screen-facing quad
 * (`center + right * corner.x + up * corner.y`). Re-deriving that basis in the
 * vertex stage would mean inverting a projected matrix per vertex; the view
 * matrix already holds it, transposed. `lookAt` builds a view matrix whose
 * rotation block's ROWS are the camera's world-space axes (the standard
 * change-of-basis construction: world-to-camera is the inverse of an
 * orthonormal rotation, i.e. its transpose). wgpu-matrix stores `mat4`
 * column-major, so those rows are a stride-4 gather: `view[0], view[4],
 * view[8]` is row 0 (right), `view[1], view[5], view[9]` is row 1 (up). The
 * app reaches the same two vectors through `cameraBillboardBasis`, which reads
 * them off its `OrbitCamera` rather than off a matrix.
 *
 * ## Why the caller passes viewportPx
 *
 * `stars.wesl` converts each sprite's NDC half-extent to PIXELS through
 * `cam.viewportPx` before clamping it to `[starPxMin, starPxMax]`. Those are
 * pixels OF THE TARGET BEING RENDERED, and the star pass renders into the
 * reduced-resolution aggregate offscreen while dust renders full-res — so the
 * two passes pack DIFFERENT viewports out of the same function, into different
 * buffers. Getting this wrong scales every clamped sprite by the divisor, with
 * no error anywhere.
 */

import { writeCameraPrefix } from '../../../../../src/services/gpu/lib/cameraUniforms';
import { MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE } from '../../../../../src/services/gpu/renderers/milkyWay/milkyWayCloudRenderer';
import type { MilkyWayTuning } from '../../../../../src/@types/settings/MilkyWayTuning';
import type { Vec2 } from '../../../../../src/@types/math/Vec2';

/** Float count of `io.wesl`'s `Uniforms` — 208 bytes / 4. */
export const CLOUD_UNIFORM_FLOATS = MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE / 4;

/**
 * The identity `model` matrix, column-major. The tool draws the generated
 * cloud in its own local space (the camera orbits at generator-unit distances)
 * rather than placing it into a scene, so there is no per-cloud transform and
 * this never varies — hoisted out of the frame loop rather than rebuilt.
 * Extras are already world-placed at generation time, so they ride the same
 * identity.
 */
const IDENTITY_MODEL = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/**
 * Pack `io.wesl`'s `Uniforms` into `dst` (which must hold at least
 * `CLOUD_UNIFORM_FLOATS` floats, and is written in place and returned,
 * following the wgpu-matrix dst-last idiom).
 *
 * `dst` is expected to be a reused per-frame scratch, so every lane INCLUDING
 * the pads is written — a reused view carries last frame's bytes and has none
 * of a fresh `Float32Array`'s zero-init guarantee.
 *
 * @param viewProj   Combined view-projection matrix, 16 floats column-major.
 * @param view       View matrix, 16 floats column-major — the billboard basis
 *                   is read off its rotation rows (see the module header).
 * @param viewportPx Pixel size of the TARGET this pass draws into, not the
 *                   canvas (see the module header).
 * @param tuning     The live look knobs, the app's own `MilkyWayTuning`.
 * @param fadeAlpha  The composed visibility fade (`deriveMilkyWayFade`).
 *                   Defaults to 1 — no fade — which is what this packer emitted
 *                   before the fade was ported.
 */
export function packCloudUniforms(
  viewProj: Float32Array,
  view: Float32Array,
  viewportPx: Vec2,
  tuning: MilkyWayTuning,
  fadeAlpha = 1,
  dst?: Float32Array,
): Float32Array {
  const out = dst ?? new Float32Array(CLOUD_UNIFORM_FLOATS);

  // viewProj 0..15, viewportPx 16..17 — the shared 80-byte camera prefix.
  writeCameraPrefix(out, viewProj, viewportPx);
  // 18..19 are CameraUniforms' two named pads, which writeCameraPrefix leaves
  // alone by contract.
  out[18] = 0;
  out[19] = 0;

  // model 20..35 — identity: this tool has no scene to place the cloud into.
  out.set(IDENTITY_MODEL, 20);

  // camRight 36..39, camUp 40..43 — vec4 (xyz + 0 pad) so each lands on a
  // clean 16-byte slot. `view` is a fixed 16-float column-major Mat4, so these
  // indices are provably in bounds — non-null assertion per the project's
  // noUncheckedIndexedAccess convention.
  out[36] = view[0]!;
  out[37] = view[4]!;
  out[38] = view[8]!;
  out[39] = 0;
  out[40] = view[1]!;
  out[41] = view[5]!;
  out[42] = view[9]!;
  out[43] = 0;

  // params0 44..47 = (fadeAlpha, exposure, modelScale, softness).
  // modelScale is 1 for the same reason `model` is the identity: this tool has
  // no scene to place the cloud into.
  out[44] = fadeAlpha;
  out[45] = tuning.exposure;
  out[46] = 1;
  out[47] = tuning.softness;

  // params1 48..51 = (starPxMin, starPxMax, starSizeScale, lodApparent).
  out[48] = tuning.starPxMin;
  out[49] = tuning.starPxMax;
  out[50] = tuning.starSizeScale;
  out[51] = tuning.lodApparent;

  return out;
}
