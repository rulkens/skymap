/**
 * ExhibitSwitch — one view switch an exhibit offers in its notes, in the `layers=` link
 * vocabulary: read through `isExhibitSwitchOn`, written through `setVisibilityActionsFor`, and
 * rewound on exit by `withSceneSnapshotSaga`'s settings snapshot.
 */

import type { ScopedVisibilityAddress } from '../animation/ScopedVisibilityAddress';
import type { VisibilityAddress } from '../animation/VisibilityAddress';

export type ExhibitSwitch = {
  /** The noun: the button reads "Show <label>" / "Hide <label>". */
  label: string;
  /** All flipped together; the switch reads on only when every one is on. */
  addresses: readonly (VisibilityAddress | ScopedVisibilityAddress)[];
};
