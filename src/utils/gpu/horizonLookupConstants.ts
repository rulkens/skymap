/** The override constants of `lib/horizonLookup.wesl`, which every pipeline linking it passes.
 *  Without the sky term the lookup loads only the sunward texels (spec §7 prices it). */
export function horizonLookupConstants(skyTerm: boolean): Record<string, GPUPipelineConstantValue> {
  return { HORIZON_SKY: skyTerm ? 1 : 0 };
}
