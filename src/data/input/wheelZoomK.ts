/**
 * Exponent scale applied to `WheelEvent.deltaY`: factor = e^(deltaY · k).
 *
 * deltaY is ~±100 per notch on a mouse (pixel delta mode), ~±3–4 on a
 * high-resolution trackpad, so one notch is e^0.1 ≈ 1.105 — about 10 % per
 * step. Exponential rather than additive so the proportional step is the same
 * whether the camera sits 0.1 Mpc or 1000 Mpc out.
 */
export const WHEEL_ZOOM_K = 0.001;
