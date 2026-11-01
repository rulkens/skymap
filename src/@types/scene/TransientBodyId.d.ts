/**
 * TransientBodyId — an object positioned per frame without a body-table row (a satellite the
 * user focused). Core places it in the frame's body snapshot (`placeLiveSelection`), so the camera
 * can pose from and follow it; nothing else about it is a body. The Layer owns the part after the
 * prefix.
 */
export type TransientBodyId = `transient:${string}`;
