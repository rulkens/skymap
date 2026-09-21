/**
 * BarGeometry — the shape of a barred galaxy's central bar: its length plus
 * the in-plane angle it is tilted to. An angle, not precomputed cos/sin:
 * `packGenerationUniforms` takes the trig on its way into the generation UBO,
 * and the analytic field wants the angle itself.
 */

export type BarGeometry = {
  readonly barLength: number;
  readonly barTiltRad: number;
};
