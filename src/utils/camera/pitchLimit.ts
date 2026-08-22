/**
 * PITCH_LIMIT — the orbit camera's pitch clamp, just shy of ±π/2.
 *
 * At exactly ±π/2 the view direction is collinear with the frame's up
 * reference, so `lookAt`'s `right = forward × up` collapses to the zero vector
 * and the view matrix goes all-NaN (gimbal lock). 0.01 rad (0.57°) of margin
 * keeps every consumer clear of it: `orbitControls` clamps both drag paths
 * here, and `surfaceDragRotation` treats a solution PAST it as a failed solve
 * rather than clamping one that then no longer holds the grabbed point (§4.4).
 */

export const PITCH_LIMIT = Math.PI / 2 - 0.01;
