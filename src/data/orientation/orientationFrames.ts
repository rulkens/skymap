/**
 * orientationFrames — the single TS home of the four orientation bases.
 *
 * An orientation frame is a choice of pole: which physically meaningful north
 * pole the camera treats as "up" (see `OrientationFrameId`). Each frame is
 * defined by its frame-local-to-world basis — three equatorial J2000 unit
 * vectors — and this module is where those bases live so every consumer reads
 * one source of truth rather than re-deriving the rotations.
 *
 * The galactic basis below doubles as the mirror of the shader's galactic
 * constants in `shaders/lib/util.wesl` (`GAL_X_EQ / GAL_Y_EQ / GAL_Z_EQ`).
 * The two copies must stay bit-for-bit equal so the CPU-side model matrix and
 * the GPU generator agree on which way the disk points; the parity test in
 * `milkyWayModelMatrix.test.ts` scrapes the shader literals and compares,
 * making drift a test failure rather than a silent rendering bug.
 */
import type { Vec3 } from '../../@types/math/Vec3';

export const GAL_X_EQ: Vec3 = [-0.054876, -0.873437, -0.483835]; // toward Galactic Centre
export const GAL_Y_EQ: Vec3 = [0.494109, -0.44483, 0.746982]; // direction of galactic rotation
export const GAL_Z_EQ: Vec3 = [-0.867666, -0.198076, 0.455984]; // toward North Galactic Pole (NGP)
