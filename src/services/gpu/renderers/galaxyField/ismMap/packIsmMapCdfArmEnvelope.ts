/**
 * packIsmMapCdfArmEnvelope — `ismMapDustCdfScan.wesl`'s `armEnvelopeBuf`:
 * `buildArmProximityEnvelope`'s CPU closure (`hiiRegions.ts:484-518`)
 * output, PACKED per (ring, arm) rather than re-derived in WGSL — a caller
 * runs that closure's `refresh(radius)` once per ring (the same cost its
 * own CPU cache already pays) and hands the ridgeAngle/weight/invSigma
 * triples here. Ring-major (`ring * armCount + arm`), matching
 * `IsmMapCdfArmEnvelopeEntry`'s 3-f32, no-padding stride — see that
 * struct's own doc for why no `DataView` is needed.
 */

export type IsmMapCdfArmEnvelopeEntry = {
  readonly ridgeAngle: number;
  readonly weight: number;
  readonly invSigma: number;
};

/** Float count per packed entry — `IsmMapCdfArmEnvelopeEntry`'s 3 f32 fields. */
export const ISM_MAP_CDF_ARM_ENVELOPE_FLOATS_PER_ENTRY = 3;

/** entries.length must equal rings * armCount — one triple per (ring, arm), ring-major. */
export function packIsmMapCdfArmEnvelope(
  entries: readonly IsmMapCdfArmEnvelopeEntry[],
): Float32Array {
  const out = new Float32Array(entries.length * ISM_MAP_CDF_ARM_ENVELOPE_FLOATS_PER_ENTRY);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    out[i * 3] = e.ridgeAngle;
    out[i * 3 + 1] = e.weight;
    out[i * 3 + 2] = e.invSigma;
  }
  return out;
}
