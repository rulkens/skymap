/**
 * CaptureStepSpec — an authored `FRAME_ORDER` line re-drawing part of the sky
 * into one `CUBEMAP_CAPTURES` row. TWO rosters because the captured content
 * spans both slabs and a render step is the unit of pass encoding: one roster
 * alone leaves the other slab's half permanently unreachable.
 *
 * The roster stays on the line rather than on the table row: order and roster
 * are the same artifact, so a capture drawing a different roster is a second
 * line naming its own keys, not a field on the row. Rows sharing a roster share
 * one line, and bake in the order named.
 */

import type { CubemapCaptureKey } from '../../rendering/CubemapCaptureKey';

export type CaptureStepSpec = {
  readonly kind: 'capture';
  readonly captures: readonly CubemapCaptureKey[];
  readonly cosmoPasses: readonly string[];
  readonly near0Passes: readonly string[];
};
