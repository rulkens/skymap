import type { CameraPose } from '../camera/CameraPose';

/** How `npm run capture-featured` frames this card; presentation data, hand-written. */
export type PaletteCardCapture = {
  /** Re-applied after the focus fly-in settles; `l`-key log units (Mpc, radians). */
  pose?: CameraPose;
  /** ISO instant, pinned via `#t=` (same string `#t=` takes). */
  t?: string;
  /** Keep the selection (focus dim) in the shot; default: clear it before capture. */
  keepFocus?: boolean;
};
