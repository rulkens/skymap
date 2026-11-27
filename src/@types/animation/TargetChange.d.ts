/** One fade identity's target change at a step instant; `overMs` resolved (a step's `over`, else 600 in / 100 out). */
export type TargetChange = { readonly atSec: number; readonly to: number; readonly overMs: number };
