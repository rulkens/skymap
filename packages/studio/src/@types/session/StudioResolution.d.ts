/**
 * One draft revision resolved against the engine (foci resolved, start pinned), or why it failed.
 * A display cache tagged with its revision: consumers ignore one that is not the draft's (A6).
 */
import type { ClipData } from '../../../../../src/@types/animation/ClipData';

export type StudioResolution =
  | { readonly revision: number; readonly data: ClipData }
  | { readonly revision: number; readonly message: string };
