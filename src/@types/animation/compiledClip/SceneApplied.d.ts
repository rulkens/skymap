/** How many of a clip's scene steps and focus steps apply at the clip clock (`atSec ≤ t`). */
export type SceneApplied = { readonly steps: number; readonly focus: number };
