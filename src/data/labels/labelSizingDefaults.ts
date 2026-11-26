/**
 * `tan(30°)`, folded into the em-to-pixel projection so a label keeps the size
 * it had before the em conversion gained the camera's `focalPx` term: every
 * style's em was tuned by eye against the old fov-blind conversion. The shader
 * (a uniform) and its CPU twin `projectRecords` both read this one copy.
 */
export const LABEL_EM_PX_RETUNE = 0.57735;
