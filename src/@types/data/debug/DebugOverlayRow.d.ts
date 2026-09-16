// Membership in DEBUG_OVERLAY_ROWS is what makes a toggle dev-only, not a
// devOnly flag (decision #16 D3).
export type DebugOverlayRow = {
  key: string;
  label: string;
  /** Which DebugPanel section renders this row. Absent = the Debug Overlays
   *  list; `'earth-tiles'` = the Earth Tile Atlas section, for toggles only
   *  legible next to that section's residency numbers. */
  section?: 'earth-tiles';
};
