/** WGSL hard-codes `@workgroup_size(16, 16)` as a compile-time literal, so unlike ISM_MAP_AZ/ISM_MAP_RINGS this stays mirrored — see `constants.parity.test.ts`'s ismMap block. */
export const ISM_MAP_WORKGROUP_SIZE = 16;
