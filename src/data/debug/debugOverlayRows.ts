// Core's own lenses: DebugOverlayKey and the settings seed both derive from this
// list. A Layer's debug toggles live in that Layer's settings and `ui` section, not here.

import type { DebugOverlayRow } from '../../@types/data/debug/DebugOverlayRow';

// pick-buffer: paints the picker's colour-mapped RGBA layer over the
// tone-mapped frame. orbit-trail-impostor: draws the ribbon impostor's hull
// as a flat fill tint over the real trails.
export const DEBUG_OVERLAY_ROWS = [
  { key: 'pick-buffer', label: 'Show pick buffer' },
  { key: 'orbit-trail-impostor', label: 'Show orbit-trail impostor' },
] as const satisfies readonly DebugOverlayRow[];
