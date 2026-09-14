/**
 * CaptureStepSpec — an authored `FRAME_ORDER` line re-drawing part of the sky
 * into `CUBEMAP_CAPTURES` rows. THREE rosters because a render step is the unit
 * of pass encoding: one roster alone leaves the other slabs' share unreachable.
 * `bodyPasses` draws once per `CaptureFace.bodySlabs` entry, so a sky face never
 * opens a body pass. The roster lives on the line, not the table row: rows
 * sharing a roster share one line and bake in the order named.
 */

import type { CubemapCaptureKey } from '../../rendering/CubemapCaptureKey';

export type CaptureStepSpec = {
  readonly kind: 'capture';
  readonly captures: readonly CubemapCaptureKey[];
  readonly cosmoPasses: readonly string[];
  readonly near0Passes: readonly string[];
  /** Each step clears the row's depth. */
  readonly bodyPasses: readonly string[];
};
