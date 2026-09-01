/**
 * foregroundFrustum — the adaptive near/far bracket for the near-field
 * (`NEAR0`) slab's foreground view-projection.
 *
 * WHY adaptive: the zoom-to-Earth foreground spans ~17 orders of magnitude,
 * from a galaxy-scale orbit (~0.4 Mpc) down to standing on Earth's surface
 * (~1e-16 Mpc). No single fixed near/far can stay precise across that range —
 * pin near too small and a galaxy-scale scene wastes all its depth resolution
 * on empty foreground; pin it too large and Earth's surface clips through the
 * near plane. So the near-field bracket tracks the camera's orbit distance:
 * whatever the camera is currently orbiting sits comfortably inside
 * [distance·1e-4, distance·100], a ~1e6 near/far ratio a depth32float buffer
 * resolves without z-fighting. The cosmological backdrop does NOT do this — it
 * is the separate `COSMO` slab row in `slabs.ts`, which keeps a fixed wide
 * bracket (10 kpc → 50 Gpc) because the cosmological scene's depth does not
 * change as the user zooms; only the near-field row's does (spec §4/§7).
 *
 * WHY near stays strictly positive: a depth buffer's precision is dominated by
 * the near plane, and `near = 0` is a degenerate perspective matrix (the
 * projection divides by the near distance). At the wheel-zoom distance floor
 * of 1e-17 Mpc (`clampDistance.ts: MIN_DISTANCE_MPC`) the pure ratio
 * `distance·1e-4` would be 1e-21 — still positive in f64, but we floor near
 * at `MIN_NEAR_MPC` to keep it robustly above zero and out of the
 * denormal/underflow neighbourhood regardless of how far the distance clamp
 * is ever lowered.
 *
 * WHY far has a scene floor: the near-field scene is SEEDED with real orbit
 * geometry — the planet orbit-ring quads (drawn depthless into HDR, so the
 * view frustum is the ONLY clip they get). With the camera focused on Earth,
 * `distance` is ~1e-15 Mpc, so a pure `distance·100` far plane lands at
 * ~1e-13 Mpc — well inside the Earth orbit ring (2 AU ≈ 1e-11 Mpc) and even
 * further inside Jupiter's (5.2 AU ≈ 2.52e-11 Mpc). Most of each ring falls
 * beyond the far plane, and because the plane sweeps as `distance` changes
 * every frame, the clip boundary cuts through the rings and they FLICKER. The
 * `FAR_MIN_MPC` floor pins far above the outermost seeded orbit so the whole
 * near-field scene always fits, killing the flicker. The pure-ratio contract
 * (far = distance·100 unconditionally) is exactly what let the far plane fall
 * below the seeded orbits.
 */

/**
 * Floor for the near plane, in Mpc — the wheel-zoom distance floor's own
 * implied minimum (`1e-17·1e-4`, `clampDistance.ts: MIN_DISTANCE_MPC`), so the
 * ratio governs everywhere a body can actually be approached and the floor
 * only guards the perspective matrix against a zero near. It must stay BELOW
 * the camera's minimum ALTITUDE over a focused body — `deriveSlabs` (`slabs.ts`)
 * passes altitude (`cam.distance - pivotRadiusMpc`) here in place of raw
 * distance once a pivot is known, so a large body's own radius no longer
 * dominates the bracket. At Earth's ~15 m standoff floor
 * (`clampDistance.ts: SURFACE_STANDOFF_RADII`) the ratio underflows and this
 * floor governs: ~6 m of near against ~15 m of altitude — a wide margin is
 * affordable because NEAR0 is reversed-Z with an infinite far plane
 * (`SLAB_REVERSED_Z`, `slabs.ts`), which spreads depth precision
 * near-uniformly regardless of how small near gets; nothing here is a
 * depth-buffer constraint, only the degenerate-matrix guard above.
 */
export const MIN_NEAR_MPC = 2e-22;

/** Sub-millimetre floor that only keeps a metres-scale near plane above zero — not a denormal dodge like `MIN_NEAR_MPC`, which stays the Mpc-scale precision floor. */
export const MIN_NEAR_M = 1e-6;

/**
 * Floor for the far plane, in Mpc. Sized to enclose the outermost seeded orbit
 * ring: Jupiter at 5.2 AU ≈ 2.52e-11 Mpc, times the ring quad's 1.1 draw
 * margin ≈ 2.77e-11 Mpc, rounded up to 3e-11 for headroom. This is the scene
 * floor that stops the ring-clipping flicker — see the module docblock.
 */
export const FAR_MIN_MPC = 3e-11;

/**
 * Fraction of the NEAR0 far plane a direction-preserving anchor clamp pulls a
 * beyond-far point to, so the clamped point lands JUST INSIDE the far plane and
 * survives the clip test instead of sitting exactly on (or past) it. Consumed by
 * `near0SelectionRingLayer` (the ring quad) and `foregroundLabelsLayer` (the
 * caption lift anchor); each clamps a camera-relative vector to
 * `slab.far * NEAR0_FAR_CLAMP_FRACTION`. 0.99 = 1% inside — comfortably clear
 * of f32 round-off at the plane while the projected screen position is unchanged
 * (a uniform length scale in the rebased frame moves only depth, not clip x/y).
 * Single-sourced so the two clamps can never pull to different depths.
 */
export const NEAR0_FAR_CLAMP_FRACTION = 0.99;

/**
 * Near-plane ratio against altitude/distance. Exported so `bodySlabRow`
 * (`slabs.ts`) can key a body-m row's near plane off the SAME ratio once the
 * camera is inside the body's outermost drawn shell, instead of minting a
 * second copy — see that call site for why raw distance stops working there.
 */
export const NEAR_RATIO = 1e-4;
const FAR_RATIO = 100;

export function foregroundFrustum(camDistanceMpc: number): { near: number; far: number } {
  const near = Math.max(camDistanceMpc * NEAR_RATIO, MIN_NEAR_MPC);
  const far = Math.max(camDistanceMpc * FAR_RATIO, FAR_MIN_MPC);
  return { near, far };
}
