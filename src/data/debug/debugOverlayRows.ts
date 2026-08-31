// Single source of truth for the toggle set (labels verbatim from
// DebugOverlaysSection.tsx); DebugOverlayKey and the settings seed both
// derive from it.

import type { DebugOverlayRow } from '../../@types/data/debug/DebugOverlayRow';

// pick-buffer: paints the picker's colour-mapped RGBA layer over the
// tone-mapped frame. disk-radius-ring: outlines each famous-galaxy
// thumbnail's disk-radius footprint. orbit-trail-impostor: draws the ribbon
// impostor's hull as a flat fill tint over the real trails. earth-lod-overlay:
// tints each drawn surface-tile fragment by how many pyramid levels its
// resolved atlas rect fell back from the leaf it's shading (green = the
// leaf's own tile, yellow/orange/red = 1/2/3+ levels coarser) — see
// earthSurfaceTile/fragment.wesl's `earthLodOverlayColor`.
export const DEBUG_OVERLAY_ROWS = [
  { key: 'pick-buffer', label: 'Show pick buffer' },
  { key: 'disk-radius-ring', label: 'Show disk radius ring' },
  { key: 'orbit-trail-impostor', label: 'Show orbit-trail impostor' },
  { key: 'earth-lod-overlay', label: 'Earth LOD overlay' },
] as const satisfies readonly DebugOverlayRow[];
