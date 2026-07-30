/**
 * Orbit-camera distance limits + the shared clamp policy.
 *
 * The limits here are the single source of truth for how far the orbit camera
 * may sit from its target. Wheel zoom, pinch zoom, focus tweens, and initial
 * framing all route through `clampDistance` so the envelope can never drift
 * between call sites.
 *
 * ### Why the floor takes the pivot's radius
 *
 * The camera dollies toward its orbit TARGET, and for a framed body that target
 * is the body's CENTRE — so a floor expressed as one global distance is either
 * inside the body or uselessly far from it, depending on the body. The floor is
 * therefore a function of what the camera is orbiting: `clampDistance` takes the
 * pivot's physical radius and stands off from its surface.
 *
 * That radius is information the clamp cannot derive, so it is a REQUIRED
 * parameter rather than an optional one. An optional argument would let a call
 * site silently fall back to the global floor — which is exactly the drift this
 * module exists to prevent — whereas a required `number | null` makes every
 * caller state, and the compiler check, whether a radius exists at the pivot.
 * The arithmetic itself (the standoff, and the interaction with the absolute
 * floor) stays in here, so callers pass a measurement, never a policy.
 */

// ─── Distance limits ──────────────────────────────────────────────────────────

/**
 * Absolute floor for `cam.distance` in Mpc — 1e-17 Mpc ≈ 309 km.
 *
 * This is a degeneracy backstop, NOT a surface stop. Earth's radius is 6371 km
 * ≈ 2.06e-16 Mpc, so 1e-17 Mpc is 0.048 Earth radii — roughly 6000 km INSIDE
 * the planet, which is how the camera used to end up flying through the globe.
 * Standing just off a surface is `SURFACE_STANDOFF_RADII`'s job; this constant
 * only keeps the distance strictly positive (so the view matrix and the
 * near-plane ratio in `foregroundFrustum` stay well conditioned) when there is
 * no pivot radius to stand off from, and gives bodies smaller than ~309 km a
 * floor at all.
 *
 * Sits below the galaxy-focus tween's minimum end distance (0.15 Mpc,
 * `galaxyFocusDistance.ts: MIN_FOCUS_DISTANCE_MPC`), so `clampDistance`
 * never ratchets a focus-on tween back outward — `clampDistance(0.15, null)`
 * returns 0.15 unchanged. The renderer's near plane and the foreground
 * viewport handle depth precision at sub-kpc scales; this constant is only
 * the wheel-zoom floor, not a depth-buffer guarantee.
 */
export const MIN_DISTANCE_MPC = 1e-17;

/**
 * Where the camera stops relative to the pivot's surface, as a multiple of the
 * pivot's radius. 1.02 ⇒ a hover altitude of 2% of the radius.
 *
 * A RATIO rather than an absolute altitude, so one number is right for every
 * body: 127 km over Earth, ~35 km over the Moon, proportionally scaled for a
 * star. An absolute altitude would be a second constant to re-tune per body,
 * and would be inside anything small.
 *
 * Why 2% and not a hair over 1.0: the standoff has to leave a horizon to look
 * at. At 1.02 radii the visible cap is `acos(1 / 1.02)` ≈ 11.4° wide, and
 * `planEarthTiles` — which returns an empty plan at or below 1.0 radii, where a
 * camera has no horizon to plan against — has a real cap to tile. At Earth's
 * 127 km altitude the finest baked ground texel (611 m) still spans several
 * screen pixels at a 40° field of view, so surface detail is inspectable rather
 * than smeared. Pushing the standoff much higher would trade that away; pushing
 * it toward 1.0 walks back into the degenerate no-horizon case.
 */
export const SURFACE_STANDOFF_RADII = 1.02;

/**
 * Maximum allowed `cam.distance` in Mpc.
 *
 * 30 Gpc keeps the wheel zoom in sync with `FAR_CLIP_MPC` so the user
 * can pull the camera out far enough to see the full Milliquas tail
 * (linear-Hubble distance `4282.75 · z`, z ≈ 7 → ~30 Gpc).  Beyond
 * this the cloud is a single dot and the user has lost all spatial
 * intuition, so we stop the wheel here rather than letting the camera
 * drift into the lonely abyss.
 */
export const MAX_DISTANCE_MPC = 30000;

/**
 * Clamp a candidate distance to the zoom envelope.
 *
 * The ceiling is always `MAX_DISTANCE_MPC`. The floor is
 * `max(MIN_DISTANCE_MPC, pivotRadiusMpc · SURFACE_STANDOFF_RADII)` when the
 * camera orbits something with a physical radius, and `MIN_DISTANCE_MPC` when
 * it does not.
 *
 * @param d               Candidate `cam.distance` in Mpc.
 * @param pivotRadiusMpc  Physical radius (Mpc) of whatever sits at the orbit
 *   pivot — a focused body or star — or `null` when the pivot has no surface to
 *   stand off from: empty space, a galaxy, a structure, the Milky Way. A galaxy
 *   or structure is a volume the camera flies INTO, so its extent is
 *   deliberately not a floor; `null` keeps those focus tweens on the absolute
 *   floor and unratcheted. (`pivotRadiusMpc` in `services/engine/camera/` is the
 *   one place that maps a resolved `SelectionRow` onto this argument.)
 */
export function clampDistance(d: number, pivotRadiusMpc: number | null): number {
  const floor =
    pivotRadiusMpc === null
      ? MIN_DISTANCE_MPC
      : Math.max(MIN_DISTANCE_MPC, pivotRadiusMpc * SURFACE_STANDOFF_RADII);
  if (d < floor) return floor;
  if (d > MAX_DISTANCE_MPC) return MAX_DISTANCE_MPC;
  return d;
}
