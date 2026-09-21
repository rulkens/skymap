import type { CameraPose } from '../camera/CameraPose';
import type { SettingsSnapshot } from '../engine/settings/SettingsSnapshot';

/** How `npm run capture-featured` frames this card; presentation data, hand-written. */
export type PaletteCardCapture = {
  /** Re-applied after the focus fly-in settles; `l`-key log units (Mpc, radians). */
  pose?: CameraPose;
  /**
   * Merged before the pose settles. A view card inherits its registry
   * `settings` for free; a tour card has no registry entry to inherit from, so
   * a thumbnail that should show the tour's stripped-down scene says so here.
   */
  settings?: Partial<SettingsSnapshot>;
  /** Frame a focused body at this phase instead; `bodyPhasePose` defines the turn. */
  phaseDeg?: number;
  /** ISO instant, pinned via `#t=` (same string `#t=` takes). */
  t?: string;
  /** Keep the selection (focus dim) in the shot; default: clear it before capture. */
  keepFocus?: boolean;
  /**
   * Hide the galaxy catalogs' point cloud. Per card, because the cloud is the
   * backdrop on a single galaxy but the subject on a group or cluster.
   */
  hideGalaxyField?: boolean;
};
