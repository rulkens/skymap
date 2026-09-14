/**
 * MAX_FRAME_INPUTS — every per-frame list at its MAXIMUM, not a real frame: the
 * query set is sized once at boot, so a bound must cover every slot a frame
 * could ever emit or that DebugPanel / perf-harness row will not exist (unused
 * slots read zero). `tone` is a placeholder — a slot NAME never reads the
 * composite's tone — and `bloomEnabled` is forced on so the `'bloom'` slot is
 * always allocated.
 */

import type { FrameInputs } from '../expandFrameOrder';
import { NEAR0 } from '../slabs';
import { BODY_SLAB_CAPACITY } from './bodySlabCapacity';

export const MAX_FRAME_INPUTS: FrameInputs = {
  tone: { exposure: 1, curve: 0, hdrKnee: 0, hdrHeadroom: 0 },
  bloomEnabled: true,
  // NEAR0 plus every capacity body row — sized off the registry, never by hand.
  foregroundChain: [NEAR0, ...Array.from({ length: BODY_SLAB_CAPACITY }, (_, k) => k + 2)],
  // All 6 faces, so the capture rows exist even when the lensing band is off.
  skyCubemapFacesToCapture: [0, 1, 2, 3, 4, 5],
  // Every capacity index: Sgr A*'s painter-order row moves with the live bodies.
  lensBodySlabs: Array.from({ length: BODY_SLAB_CAPACITY }, (_, k) => k + 2),
};
