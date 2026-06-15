import type { SourceType } from './SourceType';

/**
 * Decoded pick-buffer hit: the source code + per-source local index, the pure
 * identity the bits carry. Classifying it (galaxy-catalog galaxy vs structure
 * ring) is a registry read done downstream by `resolvePick` — the decode
 * itself stays store-free and dispatch-free.
 */
export type PickResult = { readonly sourceCode: SourceType; readonly localIdx: number };
