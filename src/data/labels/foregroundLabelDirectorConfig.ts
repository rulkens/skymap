import type { Label2DDirectorConfig } from '../../@types/engine/subsystems/Label2DDirectorConfig';
import { near0LabelProjection } from '../../services/engine/frame/near0LabelProjection';
import { NEAR0 } from '../../services/engine/frame/slabs';
import { NEAR0_FAR_CLAMP_FRACTION } from '../../utils/camera/frustum/foregroundFrustum';

// Envelope time constant (ms): ~95% of the gap closed within 3·tau (300 ms), the
// COSMO director's smoothstep ramp duration. Exponential rather than
// smoothstep because this target moves continuously with the distance band.
const CAPTION_ENVELOPE_TAU_MS = 100;

// Settle snap: landing EXACTLY on the target is load-bearing — a settled caption
// compares equal frame-to-frame, so it stops waking the render loop.
const CAPTION_ENVELOPE_SETTLE_EPS = 0.005;

/**
 * The NEAR0 slab's `Label2DDirector` config (spec §4.3). Declutter tests the
 * same padded text rects as COSMO: an anchor-distance cull let long names
 * (stellar streams, missions) overlap. `exponentialApproach`/τ 100 ms/ε 0.005 tracks a
 * continuously-moving distance-band target rather than a binary
 * appear/disappear cliff — see `applyExponentialEnvelope`'s docblock for why
 * that needs a different curve than COSMO's. `lift` clamps a lifted anchor
 * inside NEAR0's own far plane, at the same 1%-inside margin the foreground
 * layer's leader-line math has always used.
 */
export const FOREGROUND_LABEL_DIRECTOR: Label2DDirectorConfig = {
  project: near0LabelProjection,
  declutterPadPx: 8,
  envelope: {
    mode: 'exponentialApproach',
    tauMs: CAPTION_ENVELOPE_TAU_MS,
    settleEps: CAPTION_ENVELOPE_SETTLE_EPS,
  },
  lift: { slab: NEAR0, farClampFraction: NEAR0_FAR_CLAMP_FRACTION },
};
