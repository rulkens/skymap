/**
 * TakeoverState — the `takeover` slice's one fact: which source, if any,
 * currently owns the scene. `null` between runs.
 */

import type { TakeoverSource } from './TakeoverSource';

export type TakeoverState = { readonly active: TakeoverSource | null };
