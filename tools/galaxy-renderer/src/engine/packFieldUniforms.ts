/**
 * packFieldUniforms — the packer for the analytic Milky Way field pass,
 * matching `milkyWayField/io.wesl`'s `FieldUniforms` byte-for-byte (see
 * `FIELD_UNIFORM_BUFFER_SIZE` below for the live size). THAT FILE'S HEADER IS
 * THE OFFSET AUTHORITY; a wrong index here produces no error, just silently
 * garbage uniforms.
 *
 * ## Why a camera BASIS and not an inverse view-projection
 *
 * The shader needs a world-space ray per fragment. Both routes work; this one
 * is the least invasive, because every input already exists in the frame loop:
 * the camera's world right/up rows come off the view matrix exactly as
 * `packCloudUniforms` reads them for the billboards, the forward axis is the
 * negated third row, and fov/aspect/lens-shift are the arguments the engine
 * just built its projection from. An inverse-VP route would add a matrix
 * inverse per frame plus the [0,1]-vs-[-1,1] depth bookkeeping, to reconstruct
 * numbers the engine had in hand a line earlier.
 *
 * The lens shift is passed through because the engine writes one into
 * `proj[8]` to keep the galaxy centred in the panel-free part of the canvas.
 * That term subtracts from x_ndc, so the shader adds it back; omitting it
 * would slide the analytic field against the sprites whenever a side panel
 * opens — a divergence that looks like a projection bug, not a framing one.
 *
 * The mixture rides the same buffer as a fixed-size array. It only changes
 * when the galaxy is regenerated (or the ring tuning changes), but writing it
 * every frame removes any "did the mixture change" bookkeeping; the buffer is
 * rewritten per frame for the camera lanes regardless.
 */

import type { GalaxyFieldComponent } from '../../../../src/@types/galaxy/GalaxyFieldComponent';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { GALAXY_FIELD_MAX_COMPONENTS } from '../../../../src/data/galaxy/galaxyFieldMixture';

/** Float count of `io.wesl`'s `FieldUniforms` — 6 vec4 + 4 vec4 per component, up to `GALAXY_FIELD_MAX_COMPONENTS`. */
export const FIELD_UNIFORM_FLOATS = 24 + 4 * 4 * GALAXY_FIELD_MAX_COMPONENTS;

/** Byte size of the same struct, for `createBuffer`. */
export const FIELD_UNIFORM_BUFFER_SIZE = FIELD_UNIFORM_FLOATS * 4;

/** First float index of the `comps` array — 6 vec4 of camera/params precede it. */
const COMPS_BASE = 24;

export type FieldCamera = {
  /** Camera world position — the ray origin. */
  readonly eye: Vec3;
  /** View matrix, 16 floats column-major; the basis is read off its rotation rows. */
  readonly view: Float32Array;
  /** Vertical field of view in radians, as handed to `mat4.perspective`. */
  readonly fov: number;
  /** Viewport aspect the PROJECTION was built with, not the pass's own target. */
  readonly aspect: number;
  /** The value written into `proj[8]`. */
  readonly lensShiftX: number;
  /** Whole-field intensity multiplier — the tool's one look knob for this pass. */
  readonly exposure: number;
};

export function packFieldUniforms(
  cam: FieldCamera,
  mixture: readonly GalaxyFieldComponent[],
  dst?: Float32Array,
): Float32Array {
  const out = dst ?? new Float32Array(FIELD_UNIFORM_FLOATS);
  const { view } = cam;

  // eye 0..3.
  out[0] = cam.eye[0];
  out[1] = cam.eye[1];
  out[2] = cam.eye[2];
  out[3] = 0;

  // camRight 4..7, camUp 8..11, camFwd 12..15. A lookAt view matrix's rotation
  // ROWS are the camera's world axes (the transpose of an orthonormal
  // rotation); wgpu-matrix stores column-major, so each row is a stride-4
  // gather. Row 2 points AWAY from the target, hence the negation.
  out[4] = view[0]!;
  out[5] = view[4]!;
  out[6] = view[8]!;
  out[7] = 0;
  out[8] = view[1]!;
  out[9] = view[5]!;
  out[10] = view[9]!;
  out[11] = 0;
  out[12] = -view[2]!;
  out[13] = -view[6]!;
  out[14] = -view[10]!;
  out[15] = 0;

  // params 16..19 = (tanHalfFov, aspect, lensShiftX, exposure).
  out[16] = Math.tan(cam.fov / 2);
  out[17] = cam.aspect;
  out[18] = cam.lensShiftX;
  out[19] = cam.exposure;

  // counts 20..23 — only .x is read; the rest are reserved.
  const count = Math.min(mixture.length, GALAXY_FIELD_MAX_COMPONENTS);
  out[20] = count;
  out[21] = 0;
  out[22] = 0;
  out[23] = 0;

  // comps 24.. — four vec4 per component, laid out as io.wesl documents.
  for (let i = 0; i < count; i++) {
    const c = mixture[i]!;
    const base = COMPS_BASE + 16 * i;
    out[base] = c.invCovDiagonal[0];
    out[base + 1] = c.invCovDiagonal[1];
    out[base + 2] = c.invCovDiagonal[2];
    out[base + 3] = c.amplitude;
    out[base + 4] = c.invCovOffDiagonal[0];
    out[base + 5] = c.invCovOffDiagonal[1];
    out[base + 6] = c.invCovOffDiagonal[2];
    out[base + 7] = 0;
    out[base + 8] = c.color[0];
    out[base + 9] = c.color[1];
    out[base + 10] = c.color[2];
    out[base + 11] = 0;
    out[base + 12] = c.center[0];
    out[base + 13] = c.center[1];
    out[base + 14] = c.center[2];
    out[base + 15] = 0;
  }
  // Unused slots are zeroed rather than left as last frame's bytes: `dst` is a
  // reused scratch, and a stale amplitude past `count` would come back to life
  // the moment the table shrinks.
  out.fill(0, COMPS_BASE + 16 * count, FIELD_UNIFORM_FLOATS);

  return out;
}
