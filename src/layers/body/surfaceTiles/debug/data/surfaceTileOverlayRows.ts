// surface-lod-overlay: tints each drawn surface-tile fragment by how many pyramid levels its
// resolved atlas rect fell back from the leaf it's shading (green = the leaf's own tile,
// yellow/orange/red = 1/2/3+ levels coarser), see surfaceTile/surfaceLighting.wesl's
// `tileLodOverlayColor`. The rest are terrain bisect toggles; 'terrain-no-shadows' hands every
// horizon consumer (tiles and globes) `NO_HORIZON_RECT`. All sit beside the residency numbers.
export const SURFACE_TILE_OVERLAY_ROWS = [
  { key: 'surface-lod-overlay', label: 'Surface LOD overlay' },
  { key: 'terrain-no-displacement', label: 'No displacement (flat patches)' },
  { key: 'terrain-no-skirts', label: 'No skirts' },
  {
    key: 'terrain-no-shadows',
    label: 'No terrain shadows',
    info: 'Earth, Moon and Mars draw as if no horizon map had loaded: full sun and sky, no shadows.',
  },
] as const;
