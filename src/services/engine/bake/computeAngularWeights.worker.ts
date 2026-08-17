/**
 * Web-worker entry point for the lazy HEALPix angular re-weight bake.
 *
 * ### Why this file exists
 *
 * The angular re-weight bake walks the cloud three times (geometry derive,
 * count, median) and runs ~3.5 M `cartesianToRaDec + healpixNest` calls at
 * full deck.  That's ~200-500 ms of pure-JS work — short enough to barely
 * notice but long enough to drop a frame, especially on lower-end laptops.
 * Mirroring the lazy-Schechter pattern, we ship the work to a worker so the
 * main thread stays responsive while the user toggles BiasMode.AngularReweight.
 *
 * The cloud travels in by structured clone of cloned typed-array buffers
 * (slice-then-transfer pattern); the resulting `Float32Array` of weights
 * travels back via Transferable so we don't pay an extra ~14 MB copy.
 *
 * ### Lifecycle
 *
 * One message in, one message out, then the caller terminates.  No long-
 * running state — the renderer spawns one worker per loaded source on
 * mode-select, awaits all of them, and reuses the cached weights on
 * subsequent toggles (see `galaxyPointRenderer.setBiasMode`'s AngularReweight
 * bake path).
 *
 * @module
 */

import { computeAngularWeights } from './computeAngularWeights';
import type { ComputeAngularWeightsInput } from '../../../@types/engine/ComputeAngularWeightsInput';

self.onmessage = (event: MessageEvent<ComputeAngularWeightsInput>) => {
  const weights = computeAngularWeights(event.data);

  // Transfer the result's underlying ArrayBuffer back — saves a structured-
  // clone copy of the per-galaxy floats (~14 MB at 3.5 M points).
  (self as unknown as Worker).postMessage(weights, [weights.buffer]);
};
