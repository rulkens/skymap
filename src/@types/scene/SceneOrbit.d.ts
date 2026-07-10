/**
 * SceneOrbit — one debug orbit ring: an analytic circle in an orbital plane
 * that a body traces around its parent (Earth around the Sun, the Moon around
 * Earth, …).
 *
 * The ring is drawn as a scale-independent SDF annulus (see `orbitRing/*.wesl`),
 * so this record carries no tessellation — only the plane and the radius the
 * shader needs to place the analytic circle:
 *
 *   - `centerMpc`  the parent's world position (the circle's centre) in Mpc.
 *   - `uAxis`      the in-plane axis the body currently sits along — aimed AT
 *                  the body by construction, so the fragment's brightness lobe
 *                  (baked at local angle 0) lands on the body with no per-frame
 *                  angle plumbing.
 *   - `vAxis`      the orthogonal in-plane axis; `uAxis × vAxis` is the orbital-
 *                  plane normal. `(uAxis, vAxis, normal)` is orthonormal, so the
 *                  model basis the compose step builds is a pure rotation + scale.
 *   - `radiusMpc`  the orbital radius `|body − parent|` in Mpc.
 *   - `color`      a dim linear-RGB tint (drawn additively into HDR — keep the
 *                  max channel low so the ring guides without blowing out).
 *
 * Every field is DERIVED from the body seeds (`sceneBodies.ts`) at module load,
 * so a ring can never drift from the body it belongs to — the derivation is the
 * single source of truth. See `sceneOrbits.ts`.
 */

import type { Vec3 } from '../math/Vec3';

export type SceneOrbit = {
  /** Stable identifier (e.g. `'earth'`, `'jupiter'`, `'moon'`). */
  readonly id: string;
  /** Parent world position in Mpc — the circle's centre. */
  readonly centerMpc: Vec3;
  /** In-plane axis aimed at the body (local angle 0); unit length. */
  readonly uAxis: Vec3;
  /** Orthogonal in-plane axis; unit length. `uAxis × vAxis` = plane normal. */
  readonly vAxis: Vec3;
  /** Orbital radius `|body − parent|` in Mpc. */
  readonly radiusMpc: number;
  /** Dim linear-RGB tint for the additive HDR draw. */
  readonly color: Vec3;
};
