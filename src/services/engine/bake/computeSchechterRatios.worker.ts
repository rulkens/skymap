/**
 * Web-worker entry point for the lazy Schechter-ratio bake.
 *
 * ### Why this file exists
 *
 * Computing per-galaxy Schechter ratios runs a 200-step trapezoidal integral
 * per row.  At ~3.5 M galaxies that's ~700 M math ops — long enough to lock
 * the main thread for 1–2 s.  We defer this work until the user actually
 * selects Schechter LF mode in the bias picker (commit message: "lazy-compute
 * Schechter ratios on mode select"); this worker is what runs when the user
 * flips the toggle.
 *
 * The cloud travels in by structured clone; the resulting `Float32Array` of
 * ratios travels back via Transferable so we don't pay an extra ~14 MB copy.
 *
 * ### Lifecycle
 *
 * One message in, one message out, then the caller terminates.  No long-
 * running state — the renderer spawns one worker per loaded source on
 * mode-select, awaits all of them, and reuses the cached ratios on subsequent
 * toggles (see `galaxyPointRenderer.setBiasMode`'s Schechter bake path).
 *
 * @module
 */

import { computeSchechterRatios } from './computeSchechterRatios';
import type { ComputeSchechterRatiosInput } from '../../../@types/engine/ComputeSchechterRatiosInput';

self.onmessage = (event: MessageEvent<ComputeSchechterRatiosInput>) => {
  const ratios = computeSchechterRatios(event.data);

  // Transfer the result's underlying ArrayBuffer back to the caller — saves
  // a structured-clone copy of the per-galaxy floats (~14 MB at 3.5 M points).
  (self as unknown as Worker).postMessage(ratios, [ratios.buffer]);
};
