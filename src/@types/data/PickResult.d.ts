/**
 * Decoded pick-buffer hit: the pick code + per-source local index, the pure
 * identity the bits carry. `sourceCode` is a runtime pick code (`LayerCoreDeps.pickCode`),
 * never a catalog `Source` value; the owning row's `resolvePick` maps it back.
 */
export type PickResult = { readonly sourceCode: number; readonly localIdx: number };
