/**
 * DustSeed — a single dust-emission candidate produced while walking the
 * star population, before the dust pass decides whether (and how densely)
 * to emit particles at that location. `radius`/`angle` are carried alongside
 * the raw position so the dust pass doesn't recompute `hypot`/`atan2` per
 * candidate; `armFade` is the brightness envelope from the originating arm
 * (irregular-galaxy clumps, which have no arm, emit at full strength: 1).
 */

export type DustSeed = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** hypot(x, z) at emission. */
  readonly radius: number;
  /** atan2-style azimuth at emission. */
  readonly angle: number;
  /** Arm brightness envelope, 0..1; irregular clumps emit 1. */
  readonly armFade: number;
};
