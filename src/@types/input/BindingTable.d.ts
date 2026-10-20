import type { HeldIntent } from './HeldIntent';
import type { Press } from './Press';

/** Ordered rows of (pattern, intent); the first row whose every pattern key equals the press's wins. */
export type BindingTable = readonly (readonly [pattern: Partial<Press>, intent: HeldIntent])[];
