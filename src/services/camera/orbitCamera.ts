/**
 * Orbit camera — pure state-to-matrices module.
 *
 * ### What is an orbit camera?
 *
 * An orbit camera places the viewer on the surface of an imaginary sphere
 * centred on a *target* point.  The user controls:
 *
 *   - `yaw`      — spin around the world's vertical (+Y) axis  (left/right)
 *   - `pitch`    — tilt above or below the equator             (up/down)
 *   - `distance` — radius of the sphere                        (zoom)
 *
 * Every frame, those three numbers tell us exactly where the camera sits in
 * world space; `lookAt` then builds the view matrix so the camera always
 * faces the target.  This model maps naturally to orbiting a galaxy cluster:
 * spin left/right to orbit around it, tilt to see from above, scroll to
 * zoom in.
 *
 * ### Coordinate conventions
 *
 *   yaw = 0, pitch = 0  →  camera on +Z axis, looking toward origin
 *   yaw increases        →  camera rotates counter-clockwise around +Y
 *   pitch increases      →  camera tilts upward (toward +Y)
 *
 * The test `position[2] === +distance` at yaw=pitch=0 pins this convention.
 *
 * ### This module's role in the pipeline
 *
 *   OrbitCamera state  →  (this module)  →  viewProj mat4
 *   viewProj mat4      →  vertex shader  →  clip-space position
 *
 * Input events (mouse drag, wheel) will be handled by the *controls* module
 * (Task 8), which mutates an `OrbitCamera` and calls `updatePosition`.
 * This module is intentionally free of browser or WebGPU dependencies so
 * it can be tested in a plain Node/Vitest environment.
 */

import { mat4, vec3 } from 'gl-matrix';
import type { OrbitCameraInit } from '../../@types/camera/OrbitCameraInit';
import type { OrbitCamera } from '../../@types/camera/OrbitCamera';
import type { Vec3 } from '../../@types/math/Vec3';

// ─── Distance limits ──────────────────────────────────────────────────────────

/**
 * Minimum allowed `cam.distance` in Mpc.
 *
 * 0.05 Mpc = 50 kpc — below the focus-on tween's end distance (0.12 Mpc,
 * see focusTween.ts `focusDistanceMpc()`) so that focus snaps the camera
 * to its target framing without `clampDistance` ratcheting it back out
 * the next time the user wheel-zooms.  At this distance the camera is
 * sitting inside the Local-Group footprint of a typical galaxy — close
 * enough that the disk's 30-kpc-diameter texture fills a substantial
 * fraction of the screen but not so close we're inside the disk plane
 * itself (which would expose perspective artefacts the billboard
 * approximation isn't built for).  Hard floor; the orbit-camera near
 * plane (engine.ts: 0.01 Mpc) handles the much-closer case where the
 * tween briefly puts the camera right on top of the galaxy mid-flight.
 */
export const MIN_DISTANCE_MPC = 0.05;

/**
 * Maximum allowed `cam.distance` in Mpc.
 *
 * 5 Gpc is well past the deepest BOSS spectroscopic galaxy (z ≈ 0.7
 * → ~3 Gpc under Hubble's law) and roughly the entire observable universe
 * along any single line of sight.  Beyond this the cloud is a single dot
 * and the user has lost all spatial intuition, so we stop the wheel here
 * rather than letting the camera drift into the lonely abyss.
 */
export const MAX_DISTANCE_MPC = 5000;

/**
 * Clamp a candidate distance to `[MIN_DISTANCE_MPC, MAX_DISTANCE_MPC]`.
 *
 * Centralised so wheel zoom, SpaceMouse zoom, focus tweens and initial
 * framing all share the same policy — drift here would be hard to debug.
 */
export function clampDistance(d: number): number {
  if (d < MIN_DISTANCE_MPC) return MIN_DISTANCE_MPC;
  if (d > MAX_DISTANCE_MPC) return MAX_DISTANCE_MPC;
  return d;
}

// ─── Construction ─────────────────────────────────────────────────────────────

/**
 * Create a new orbit camera from the given parameters.
 *
 * `position` is computed immediately so the camera is ready to use
 * without a separate call to `updatePosition`.
 *
 * @param init  All camera parameters. See `OrbitCameraInit` for details.
 * @returns A fully-initialised `OrbitCamera` whose `position` reflects
 *          the given yaw, pitch, and distance.
 */
export function createOrbitCamera(init: OrbitCameraInit): OrbitCamera {
  // Allocate a zero vec3; updatePosition will fill it before we return.
  const cam: OrbitCamera = { ...init, position: vec3.create() };
  updatePosition(cam);
  return cam;
}

// ─── State update ─────────────────────────────────────────────────────────────

/**
 * Recompute `cam.position` from the current yaw, pitch, distance, and target.
 *
 * Call this every time you mutate `cam.yaw`, `cam.pitch`, `cam.distance`, or
 * `cam.target`.  Typically the controls module calls this after processing a
 * mouse or touch event.
 *
 * ### The math
 *
 * We convert spherical coordinates (r = distance, θ = yaw, φ = pitch) to
 * Cartesian using a **right-handed, Y-up** frame where yaw=0, pitch=0 is
 * the +Z axis:
 *
 *     dir.x = cos(pitch) · sin(yaw)   ← east/west spread scaled by cos(pitch)
 *     dir.y = sin(pitch)               ← vertical component
 *     dir.z = cos(pitch) · cos(yaw)   ← north/south spread scaled by cos(pitch)
 *
 * At yaw=0, pitch=0:
 *   dir = [0, 0, 1]  → camera is at target + distance·ẑ, which is +Z.
 *
 * `cos(pitch)` acts as a "horizontal radius" that shrinks as the camera
 * tilts toward the poles, keeping the total length = 1.
 *
 * Finally:  position = target + distance · dir
 *
 * (This is `vec3.scaleAndAdd`: dst = a + b*scale.)
 *
 * @param cam  The camera to update in-place.
 */
export function updatePosition(cam: OrbitCamera): void {
  const cp = Math.cos(cam.pitch); // horizontal-plane scale factor
  const sp = Math.sin(cam.pitch); // vertical (Y) component
  const cy = Math.cos(cam.yaw); // Z component (at pitch=0, yaw=0 → Z=1)
  const sy = Math.sin(cam.yaw); // X component (at pitch=0, yaw=π/2 → X=1)

  // Unit direction vector from target toward camera in world space.
  // Follows the spherical-to-Cartesian formula described above.
  const dir = vec3.fromValues(cp * sy, sp, cp * cy);

  // position = target + distance * dir
  // vec3.scaleAndAdd(out, a, b, scale) computes  out = a + b*scale.
  vec3.scaleAndAdd(cam.position, cam.target as vec3, dir, cam.distance);
}

// ─── Matrix computation ───────────────────────────────────────────────────────

/**
 * Compute the combined view-projection matrix for the given camera state.
 *
 * Returns a `mat4` ready to upload to a GPU uniform buffer.  Multiply a
 * world-space position `p` (as `vec4`) by this matrix to get its clip-space
 * position:
 *
 *     clipPos = viewProj * worldPos
 *
 * ### View matrix — `mat4.lookAt`
 *
 * `lookAt(eye, center, up)` places the camera at `eye`, aiming at `center`,
 * with the world +Y axis as "up".  The result is a rotation + translation
 * that transforms world-space coordinates into *camera space* (sometimes
 * called "eye space"):
 *
 *   - Camera sits at the origin.
 *   - −Z points *into* the scene (toward `center`).
 *   - +Y aligns with the world-up projected onto the image plane.
 *
 * ### Projection matrix — `mat4.perspectiveZO` (not `perspectiveNO`)
 *
 * gl-matrix offers two perspective variants:
 *
 *   - `perspectiveNO` — maps the view frustum to clip-space depth **[−1, +1]**
 *     (OpenGL convention, "Normalized range from Negative to pOsitive one").
 *   - `perspectiveZO` — maps the view frustum to clip-space depth **[0, 1]**
 *     (WebGPU / Direct3D / Metal convention, "Zero to One").
 *
 * WebGPU's NDC (Normalised Device Coordinates) uses the [0, 1] depth range.
 * Using `perspectiveNO` would map depths to [−1, +1] in clip space, but the
 * hardware would then interpret those values against a [0, 1] depth buffer,
 * effectively discarding half the frustum and inverting depth comparisons.
 * The result is objects that disappear or z-fight incorrectly.  Always use
 * `perspectiveZO` for WebGPU.
 *
 * ### Multiplication order — `proj * view`
 *
 * gl-matrix stores matrices in **column-major** order (same as GLSL and WGSL).
 * In column-major convention, vectors are column vectors and the transform
 * chain is read right-to-left:
 *
 *     clipPos = (proj * view) * worldPos
 *               ↑ applied last   ↑ applied first
 *
 * So `mat4.multiply(vp, proj, view)` computes `proj * view`, applying the
 * view transform first (world → camera) and the projection second (camera →
 * clip).  This is the standard MVP formula with M = Identity.
 *
 * @param cam  The orbit camera whose state to snapshot into matrices.
 * @returns A new `mat4` representing the combined view-projection transform.
 */
export function computeViewProj(cam: OrbitCamera): mat4 {
  // ── View matrix ──────────────────────────────────────────────────────────
  //
  // We need an "up" vector for `lookAt`.  By default this is world +Y, which
  // works for any camera position that isn't exactly on the +Y or −Y pole
  // (hence the pitch-clamp in the controls module).
  //
  // When `cam.roll` is non-zero we rotate that up-vector around the view
  // direction (target − position) using Rodrigues' rotation formula:
  //
  //   v_rot = v·cosθ  +  (k×v)·sinθ  +  k·(k·v)·(1−cosθ)
  //
  // where k is the *unit* view-direction axis and θ is the roll angle.
  //
  // For roll = 0 the formula collapses to v_rot = v (cosθ = 1, sinθ = 0,
  // last term = 0), so the no-roll path is algebraically identical — we use
  // an early-exit for performance and clarity.
  //
  // With v = (0, 1, 0):
  //   k · v = ky           (dot product)
  //   k × v = (kz, 0, −kx) (cross product — note the zero middle component)
  //
  // This expansion is inlined to stay dependency-free (no additional
  // gl-matrix imports beyond what was already present).
  const roll = cam.roll ?? 0;
  let upX = 0;
  let upY = 1;
  let upZ = 0;
  if (Number.isFinite(roll) && roll !== 0) {
    // k = unit vector from position toward target (the view direction axis)
    const tgt = cam.target as Vec3;
    let kx = tgt[0] - cam.position[0];
    let ky = tgt[1] - cam.position[1];
    let kz = tgt[2] - cam.position[2];
    const klen = Math.hypot(kx, ky, kz) || 1;
    kx /= klen;
    ky /= klen;
    kz /= klen;
    const c = Math.cos(roll);
    const s = Math.sin(roll);
    // v = (0, 1, 0); k · v = ky; k × v = (kz, 0, −kx)
    const dot = ky;
    const crossX = kz;
    const crossY = 0;
    const crossZ = -kx;
    upX = 0 * c + crossX * s + kx * dot * (1 - c);
    upY = 1 * c + crossY * s + ky * dot * (1 - c);
    upZ = 0 * c + crossZ * s + kz * dot * (1 - c);
  }

  const view = mat4.create();
  mat4.lookAt(
    view,
    cam.position, // eye: where the camera is
    cam.target as vec3, // center: what the camera looks at
    [upX, upY, upZ], // up: world +Y by default; rotated by roll when non-zero
    // ⚠ If pitch = ±π/2, `position` is directly above/below `target` and
    // the default up vector is parallel to the view direction.  lookAt
    // produces a degenerate matrix in that case.  The controls module
    // (Task 8) prevents this by clamping pitch to ±(π/2 − ε).
  );

  // ── Projection matrix ────────────────────────────────────────────────────
  const proj = mat4.create();
  // perspectiveZO: depth maps to [0, 1] — required for WebGPU.
  mat4.perspectiveZO(proj, cam.fovYRad, cam.aspect, cam.near, cam.far);

  // ── Combined view-projection ─────────────────────────────────────────────
  const vp = mat4.create();
  // mat4.multiply(out, a, b) computes out = a * b.
  // Reading right-to-left: view is applied first, then projection.
  mat4.multiply(vp, proj, view);
  return vp;
}
