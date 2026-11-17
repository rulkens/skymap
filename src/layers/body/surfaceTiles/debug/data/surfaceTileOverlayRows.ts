// surface-lod-overlay: tints each drawn surface-tile fragment by how many pyramid levels its
// resolved atlas rect fell back from the leaf it's shading (green = the leaf's own tile,
// yellow/orange/red = 1/2/3+ levels coarser), see surfaceTile/surfaceLighting.wesl's
// `tileLodOverlayColor`. The other two are terrain bisect toggles. All three sit beside the
// residency numbers that explain what they change.
export const SURFACE_TILE_OVERLAY_ROWS = [
  { key: 'surface-lod-overlay', label: 'Surface LOD overlay' },
  { key: 'terrain-no-displacement', label: 'No displacement (flat patches)' },
  { key: 'terrain-no-skirts', label: 'No skirts' },
] as const;
