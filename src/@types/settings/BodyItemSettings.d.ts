/**
 * BodyItemSettings — per-item settings for one near-field body (held in
 * `settings.bodies.items`, keyed by body id).
 *
 * A body adds a label axis on top of the universal visibility axis, exactly as
 * a star catalog or a structure does: `enabled` is the body itself, and
 * `labelEnabled` is its caption. Co-locating both on one row means a reader
 * walks one entry to learn everything about a body's visibility, instead of
 * cross-indexing the item record against a separate label bag.
 */

import type { DataItemSettings } from './DataItemSettings';

export type BodyItemSettings = DataItemSettings & {
  /** Whether this body's caption is shown (the body itself is the base `enabled`). */
  labelEnabled: boolean;
};
