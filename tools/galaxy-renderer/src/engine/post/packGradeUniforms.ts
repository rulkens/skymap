/**
 * packGradeUniforms — the tool-only grade trailer's uniform. `grade.wesl`'s
 * binding 2 IS THE LANE AUTHORITY, and it is a bare `vec4<f32>` rather than a
 * named struct, so nothing scrapes it: a lane written to the wrong index
 * throws nothing, it just ships a vignette where a saturation belonged.
 *
 * `gammaEncode` is the one lane that is not a pass-through — the shader tests
 * `u.z > 0.5`, so the boolean is carried as 1/0.
 */

/** Float count of `grade.wesl`'s uniform: one `vec4<f32>`, `w` unused. */
export const GRADE_UNIFORM_FLOATS = 4;

/** Byte size of the same, for `createBuffer`. */
export const GRADE_UNIFORM_BUFFER_SIZE = GRADE_UNIFORM_FLOATS * 4;

/** The three knobs the app has no equivalent for — see `grade.wesl`'s header. */
export type GradeUniformsInput = {
  /** 1 = identity; 0 is greyscale, >1 pushes. */
  readonly saturation: number;
  /** 0 = identity; the depth of the radial darkening. */
  readonly vignette: number;
  /** Applies `pow(c, 1/2.2)` to the tone-mapped result. Off in the app-parity configuration. */
  readonly gammaEncode: boolean;
};

export function packGradeUniforms(
  { saturation, vignette, gammaEncode }: GradeUniformsInput,
  dst?: Float32Array,
): Float32Array {
  const out = dst ?? new Float32Array(GRADE_UNIFORM_FLOATS);

  out[0] = saturation;
  out[1] = vignette;
  out[2] = gammaEncode ? 1 : 0;
  out[3] = 0;

  return out;
}
