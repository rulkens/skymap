// Single source of truth for the toggle set (labels verbatim from
// DebugOverlaysSection.tsx); DebugOverlayKey and the settings seed both
// derive from it.

import type { DebugOverlayRow } from '../../@types/data/debug/DebugOverlayRow';

// pick-buffer: paints the picker's colour-mapped RGBA layer over the
// tone-mapped frame. disk-radius-ring: outlines each famous-galaxy
// thumbnail's disk-radius footprint. orbit-trail-impostor: draws the ribbon
// impostor's hull as a flat fill tint over the real trails.
export const DEBUG_OVERLAY_ROWS = [
  { key: 'pick-buffer', label: 'Show pick buffer' },
  { key: 'disk-radius-ring', label: 'Show disk radius ring' },
  { key: 'orbit-trail-impostor', label: 'Show orbit-trail impostor' },
] as const satisfies readonly DebugOverlayRow[];
