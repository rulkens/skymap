/**
 * minPickRadiusMpc — floor a sphere body's PICK radius so its clickable
 * footprint never drops below a shared minimum on screen.
 *
 * ### Why a pick-only floor
 *
 * A resolved foreground sphere (Earth, a planet, a focused field star) is drawn
 * at its TRUE physical radius, which at the far edge of the foreground band can
 * project to only a pixel or two across. A body that small is nearly impossible
 * to click — the cursor has to land inside a ~2 px disk. The point-partition
 * bodies (glints, seeded scene stars) already avoid this: their pick billboard
 * expands to a generous fixed footprint (`FAMOUS_STAR_PICK_RADIUS_PX = 9` px
 * radius / 18 px diameter — see `starPointPick.wesl`). This helper carries that
 * same clickable floor to the SPHERE pick pass, so a body's pick silhouette is
 * `max(true sphere, min-footprint disk)`: identical to the visual sphere when
 * the body is comfortably above the floor, inflated to the floor when it is not.
 * The VISUAL sphere is untouched — only the pick-pass model radius grows, so the
 * hit area quietly widens without changing what the user sees.
 *
 * ### The px → Mpc conversion
 *
 * `BODY_PICK_MIN_RADIUS_PX` is a screen-space radius; the sphere pick model
 * matrix wants a world-space radius in Mpc. A sphere of physical radius `r` at
 * camera distance `d` projects to an angular radius of `~r/d` rad, i.e.
 * `(r/d)·pxPerRad` px. Inverting for the radius that projects to exactly the min
 * pixel footprint gives `r_min = (BODY_PICK_MIN_RADIUS_PX / pxPerRad)·d`. The
 * floor is then `max(true r, r_min)`.
 */

/**
 * The shared minimum clickable pick RADIUS in pixels — the TS twin of
 * `FAMOUS_STAR_PICK_RADIUS_PX` in `starPointPick.wesl` (9 px radius / 18 px
 * diameter), so the sphere pick floor matches the point-partition footprint. A
 * parity test pins the two to the same value.
 */
export const BODY_PICK_MIN_RADIUS_PX = 9;

/**
 * The pick-pass sphere radius (Mpc): the body's true `radiusMpc`, floored so its
 * projected footprint is never smaller than `BODY_PICK_MIN_RADIUS_PX`.
 *
 * @param radiusMpc   The body's true equatorial radius in Mpc (what the VISUAL
 *                    sphere uses).
 * @param camDistMpc  Camera-to-body distance in Mpc.
 * @param pxPerRad    Pinhole radian→pixel conversion (`ctx.drawPxPerRad`).
 * @returns  `max(radiusMpc, (BODY_PICK_MIN_RADIUS_PX / pxPerRad)·camDistMpc)`.
 */
export function minPickRadiusMpc(radiusMpc: number, camDistMpc: number, pxPerRad: number): number {
  return Math.max(radiusMpc, (BODY_PICK_MIN_RADIUS_PX / pxPerRad) * camDistMpc);
}
