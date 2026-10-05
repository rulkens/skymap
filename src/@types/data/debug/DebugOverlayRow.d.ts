// Membership in DEBUG_OVERLAY_ROWS is what makes a toggle dev-only, not a
// devOnly flag (decision #16 D3).
export type DebugOverlayRow = {
  key: string;
  label: string;
  /** Which DebugPanel section renders this row. Absent = the Debug Overlays
   *  list; otherwise the section whose own readouts or knobs the toggle is
   *  only legible beside — `'surface-tiles'` the residency numbers,
   *  `'terrain-pick-marker'` the marker's radius knob. */
  section?: 'surface-tiles' | 'terrain-pick-marker';
};
