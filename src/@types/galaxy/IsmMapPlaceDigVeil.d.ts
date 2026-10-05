import type { PlaceDigVeilDispatchInput } from './PlaceDigVeilDispatchInput';

export type IsmMapPlaceDigVeil = {
  /** Encode into the CALLER's encoder/pass — no submit here (one-encoder-one-submit discipline). */
  dispatchPlaceDigVeil(enc: GPUCommandEncoder, input: PlaceDigVeilDispatchInput): void;
  /** Debug-only: dispatch in its own encoder/submit and map the DIG slot range straight back — the probe's determinism/liveness/flux-parity exception, no production caller. */
  dispatchAndReadbackDigVeil(input: PlaceDigVeilDispatchInput): Promise<Float32Array>;
  dispose(): void;
};
