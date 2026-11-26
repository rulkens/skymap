/**
 * The override constants of `lib/horizonLookup.wesl`, which every pipeline linking it passes.
 * Without the sky term the lookup loads half the texels: on a OnePlus 7T at Jezero 16 loads
 * took the frame from 16.8 to 21.1 ms (p90 51 ms), the sun alone kept it at 16.8 (spec §7).
 */
export function horizonLookupConstants(skyTerm: boolean): Record<string, GPUPipelineConstantValue> {
  return { HORIZON_SKY: skyTerm ? 1 : 0 };
}
