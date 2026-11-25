/** HorizonTile — one baked horizon tile. `'flat'` ships as a zero-byte file (an `'empty'`
 *  archive entry, read as fully lit); `'image'` is the 66 × 66 RGBA8 raster, 2×2 texels per
 *  post, packed by `horizonTexelOf`. */
export type HorizonTile =
  | { readonly kind: 'flat' }
  | { readonly kind: 'image'; readonly rgba: Uint8Array };
