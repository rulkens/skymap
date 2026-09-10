/**
 * The request shape a mesh-asset fetcher accepts: a mesh is a fixed
 * catalog entry (whale, petunias, …), not tiered or per-source.
 */
export type MeshReq = { readonly meshKey: string };
