/** TileRead — what one archive read found. `'empty'` is a zero-length index entry: the
 *  bake ran and deliberately stored nothing, so unlike `'missing'` and `'failed'` the
 *  key counts as answered. */
export type TileRead =
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly kind: 'empty' }
  | { readonly kind: 'missing' } // not in the index, or the level has no index (404)
  | { readonly kind: 'failed' }; // corrupt index, non-206, short body, timeout, network error
