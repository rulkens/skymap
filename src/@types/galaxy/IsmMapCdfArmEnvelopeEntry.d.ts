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
