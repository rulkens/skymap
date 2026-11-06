import type { ScopedVisibilityAddress } from '../animation/ScopedVisibilityAddress';
import type { VisibilityAddress } from '../animation/VisibilityAddress';

/** One `layers=` token: a tour-cue visibility address switched on or off. Applied through
 * `setVisibilityActionsFor`, so a bare per-item address means what a cue's does. */
export type LayerSwitch = {
  readonly address: VisibilityAddress | ScopedVisibilityAddress;
  readonly on: boolean;
};
