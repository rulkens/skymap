/**
 * Pitch ceiling: at exactly ±π/2 forward is collinear with the reference up and
 * `lookAt` degenerates to an all-NaN view matrix (gimbal lock). The 0.01 rad
 * (≈0.57°) gap is invisible.
 */
export const PITCH_LIMIT = Math.PI / 2 - 0.01;
