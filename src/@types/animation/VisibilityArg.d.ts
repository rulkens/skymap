import type { VisibilityAddress } from './VisibilityAddress';

/** What the cue helpers accept: an atomic address, or `'labels'` for every label address. */
export type VisibilityArg = VisibilityAddress | 'labels';
