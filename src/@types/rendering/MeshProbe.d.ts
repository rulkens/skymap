/**
 * MeshProbe — a mesh body's own reflection probe, minted with its material
 * maps: the capture writes mip 0 face by face, `prefilterCubeGgx` fills the
 * rest, and the fragment reads specular by mip and diffuse from the coarsest.
 */

export type MeshProbe = {
  /** rgba16float, 6 layers, full mip chain; mip 0 is captured, 1.. are GGX-prefiltered. */
  readonly cube: GPUTexture;
  /** depth32float, one layer, the capture's depth for the host body-m step. */
  readonly depth: GPUTexture;
};
