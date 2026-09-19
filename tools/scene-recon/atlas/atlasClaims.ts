/**
 * Codes for the one `Int32Array` of per-texel claims every pack stage shares: a chart index
 * (`>= 0`) means "this chart wrote it", and the three sentinels below cover everything else —
 * one array carries both is-filled and who-filled-it, so a reader never juggles two masks.
 */
export const ATLAS_CLAIM = { free: -1, orphan: -2, dilated: -3 } as const;
