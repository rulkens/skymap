/**
 * MAX_FRAME_INPUTS — every per-frame list at its MAXIMUM, not a real frame: the
 * query set is sized once at boot, so a bound must cover every slot a frame
 * could ever emit or that DebugPanel / perf-harness row will not exist (unused
 * slots read zero). `tone` is a placeholder — a slot NAME never reads the
 * composite's tone — and `bloomEnabled` is forced on so the `'bloom'` slot is
 * always allocated.
 */

import type { CubemapCaptureKey } from '../../../../@types/rendering/CubemapCaptureKey';
import { ALL_CUBE_FACES, CUBEMAP_CAPTURES } from '../../../../data/rendering/cubemapCaptures';
import type { FrameInputs } from '../expandFrameOrder';
import { NEAR0 } from '../slabs';
import { BODY_SLAB_CAPACITY } from './bodySlabCapacity';

export const MAX_FRAME_INPUTS: FrameInputs = {
  tone: { exposure: 1, curve: 0, hdrKnee: 0, hdrHeadroom: 0 },
  bloomEnabled: true,
  // NEAR0 plus every capacity body row — sized off the registry, never by hand.
  foregroundChain: [NEAR0, ...Array.from({ length: BODY_SLAB_CAPACITY }, (_, k) => k + 2)],
  // Every row's 6 faces, so the capture slots exist even when no band is on —
  // sized off the registry, so a second capture row needs no edit here. A
  // probe face may draw its subject's host, which can sit in any body row.
  captureFaces: new Map(
    (Object.keys(CUBEMAP_CAPTURES) as readonly CubemapCaptureKey[]).map((key) => [
      key,
      ALL_CUBE_FACES.map((face) => ({
        face,
        bodySlabs:
          CUBEMAP_CAPTURES[key].kind === 'probe'
            ? Array.from({ length: BODY_SLAB_CAPACITY }, (_, k) => k + 2)
            : [],
      })),
    ]),
  ),
  bodyRowSlabs: {
    // Every capacity index: Sgr A*'s painter-order row moves with the live bodies.
    lens: Array.from({ length: BODY_SLAB_CAPACITY }, (_, k) => k + 2),
    insideAtmosphere: [],
  },
};
