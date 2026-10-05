import type { IsmMapCdfArmEnvelopeEntry } from '../../../../../@types/galaxy/IsmMapCdfArmEnvelopeEntry';

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
