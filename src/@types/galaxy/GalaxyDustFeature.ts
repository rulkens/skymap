/**
 * GalaxyDustFeature — one detail-tier dust splat for `milkyWayField/dustFeature.wesl`:
 * a world-space oriented segment, plane-crossing tau evaluated per fragment
 * (design: `docs/grill-sessions/analytic-dust-lane-2026-08-01.md` Part 2, N1).
 *
 * `kind` 0 is a lane segment (`dustLaneFeatures.ts`); the record shape is
 * shared with the spurs/bubbles/beads classes N2 lists next — a bubble rim
 * arc or a bead knot reuses these same fields with a different `kind` rather
 * than growing the GPU layout again.
 */
import type { Vec3 } from '../math/Vec3';

export type GalaxyDustFeature = {
  readonly p0: Vec3;
  readonly p1: Vec3;
  /** Local disc-plane normal at this segment — the plane `dustFeature.wesl`'s fs intersects the view ray against. */
  readonly normal: Vec3;
  /** Across-lane super-Gaussian sigma. */
  readonly width: number;
  /** Peak tau density; the shader's plane-crossing profile scales it by incidence. */
  readonly amplitude: number;
  /** Super-Gaussian exponent of the across-lane profile (4.0 = sharp-edged, not Gaussian-soft). */
  readonly edgeSharpness: number;
  /** Deterministic per-arm offset into the shader's along-lane value noise. */
  readonly noiseSeed: number;
  /** Along-lane crinkle amplitude, 0 = smooth. */
  readonly noiseAmp: number;
  /** Along-lane noise frequency, in 1/(world length unit). */
  readonly noiseFreq: number;
  /** 0 = lane segment; reserved for spur/bubble-rim/bead records. */
  readonly kind: number;
  /** This segment's start arc-length along its whole chain — keeps the along-lane noise phase-continuous across joints. */
  readonly sOffset: number;
  /** Taper length in world units at this segment's start; 0 butts seamlessly against the previous segment instead of dimming to zero at the joint. */
  readonly taperIn: number;
  /** Taper length in world units at this segment's end; 0 butts seamlessly against the next segment. */
  readonly taperOut: number;
};
