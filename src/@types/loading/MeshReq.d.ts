import type { Tier } from '../../../packages/shared/src/@types/data/Tier';

/**
 * The request shape a mesh-asset fetcher accepts: a fixed catalog entry
 * (whale, petunias, …) at a tier already clamped to the body's `tierCeiling`
 * by `meshAssetRow`'s `req` — mirrors `BodyTextureReq`.
 */
export type MeshReq = { readonly meshKey: string; readonly tier: Tier };
