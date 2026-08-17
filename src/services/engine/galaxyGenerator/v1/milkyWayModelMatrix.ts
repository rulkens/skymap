/**
 * milkyWayModelMatrix — DERIVATION: the frame-rotation maths below is
 * unreadable without it, hence the longer-than-usual header. Builds the
 * transform that drops the GPU-generated Milky Way point cloud into the
 * scene at the galaxy's real place and orientation: centred on Sgr A*
 * (`MILKY_WAY_CENTER_WORLD`), disk in the galactic plane.
 *
 * ## The frame chain
 *
 * The generator emits stars in its own *local* frame: a flat disk in the
 * y = 0 plane, with +y as the disk normal (the ShaderToy spiral's convention,
 * see `galacticToShader` in `shaders/lib/util.wesl`). We need those stars in
 * the app's *world* frame — right-handed equatorial J2000, Mpc, origin at the
 * Sun. Two rotations bridge the gap, and they're already baked, as fixed
 * astronomical constants, into the WESL galactic basis:
 *
 *   local frame  --swizzle-->  galactic frame  --rotation-->  equatorial world
 *
 * `worldToGalactic` (in util.wesl) rotates a world vector into the galactic
 * frame; its columns are `GAL_X_EQ / GAL_Y_EQ / GAL_Z_EQ`. We want the
 * *inverse* (galactic -> world), which for a pure rotation is the transpose —
 * i.e. those same three vectors become the *columns* of the world-space
 * rotation. The `galacticToShader` swizzle (shader.y = galactic.Z = NGP) then
 * decides which galactic axis each local axis maps to. Folding both together
 * gives the rotation whose columns are, in local-axis order:
 *
 *   | local axis                 | world direction   | column value |
 *   | -------------------------- | ----------------- | ------------ |
 *   | x (in-disk, toward GC)     | GAL_X_EQ          | column 0     |
 *   | y (disk normal)            | GAL_Z_EQ (NGP)    | column 1     |
 *   | z (in-disk, rotation dir)  | GAL_Y_EQ          | column 2     |
 *
 * The easy-to-invert trap is column 1: the disk normal is the galactic *Z*
 * axis (the North Galactic Pole), so local +y maps to `GAL_Z_EQ`, not
 * `GAL_Y_EQ`. The galactic basis lives in the orientation-frame registry
 * (`data/orientation/orientationFrames`); those literals must stay equal to
 * util.wesl's — a parity test scrapes them to guarantee it.
 *
 * ## Why write the 16 elements by hand
 *
 * The full transform is `translate(centre) x R_localToWorld x uniformScale(k)`.
 * Because the rotation is three *fixed columns* rather than an angle/axis, the
 * clearest correct construction is to place the elements directly into a
 * column-major `Float32Array(16)`: each rotation column is its galactic basis
 * vector times `k`, the translation column is the world centre, the bottom row
 * is `(0,0,0,1)`. Composing this out of `mat4.translation`/`mat4.scale` would
 * only re-derive the same twelve products through an opaque multiply — and
 * wgpu-matrix's `mat4.create()` returns *zeros*, not identity, so the
 * hand-built form is also the one with the fewest footguns. `k` (a uniform
 * scale) multiplies every rotation column identically, so it simply rides
 * along on each stored product.
 *
 * Built once per call with no module-level mutable state; callers cache the
 * result (the placement never changes).
 */
import { GAL_X_EQ, GAL_Y_EQ, GAL_Z_EQ } from '../../../../data/orientation/orientationFrames';
import { MILKY_WAY_CENTER_WORLD } from '../../../../data/milkyWay/galacticCenter';
import { MILKY_WAY_MODEL_SCALE } from './milkyWayCalibration';

export function milkyWayModelMatrix(): Float32Array {
  const k = MILKY_WAY_MODEL_SCALE;

  // prettier-ignore
  return new Float32Array([
    GAL_X_EQ[0] * k, GAL_X_EQ[1] * k, GAL_X_EQ[2] * k, 0, // column 0: local +x
    GAL_Z_EQ[0] * k, GAL_Z_EQ[1] * k, GAL_Z_EQ[2] * k, 0, // column 1: local +y (disk normal)
    GAL_Y_EQ[0] * k, GAL_Y_EQ[1] * k, GAL_Y_EQ[2] * k, 0, // column 2: local +z
    MILKY_WAY_CENTER_WORLD[0], MILKY_WAY_CENTER_WORLD[1], MILKY_WAY_CENTER_WORLD[2], 1, // column 3: translation
  ]);
}
