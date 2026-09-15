/**
 * The LOD-3 array's per-layer edge length. WebGPU textures are immutable in shape, so a
 * change of side means a new allocation — which is exactly a new request.
 */
export type HiResFamousReq = { readonly layerSide: number };
