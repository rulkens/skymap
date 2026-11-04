/**
 * SurfaceEffectInputs — the per-draw resources behind each `SurfaceEffect` a
 * tile variant shades with. Exactly the row's listed effects are present: the
 * renderer throws on a missing or surplus key, since either means the bind
 * group and the variant's shader disagree.
 */
export type SurfaceEffectInputs = {
  readonly materialMap?: { readonly view: GPUTextureView; readonly oceanRoughness: number };
  readonly nightLights?: { readonly view: GPUTextureView };
  readonly cloudShadows?: {
    readonly view: GPUTextureView;
    readonly strength: number;
    /** Unit-sphere radius of the cloud shell the shadow is cast through. */
    readonly shellRadius: number;
  };
};
