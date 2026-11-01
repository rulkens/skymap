import { FOREGROUND_MAX_DISTANCE_MPC } from '../rendering/foregroundMaxDistance';

// Cosmic-scale content yields once the local starfield fills the near field: the far edge
// is the foreground gate BY IMPORT, the scale where that starfield switches on.
export const SURVEY_DEEP_ZOOM = { in: [0.002, FOREGROUND_MAX_DISTANCE_MPC] } as const;
