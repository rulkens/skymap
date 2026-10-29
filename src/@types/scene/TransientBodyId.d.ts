/**
 * TransientBodyId — an object a Layer positions per frame without a body-table row (a satellite
 * the user focused). It joins `deriveBodyStates` through `transientPositions`, so the camera can
 * pose from and follow it; nothing else about it is a body. The Layer owns the part after the
 * prefix.
 */
export type TransientBodyId = `transient:${string}`;
