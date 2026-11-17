import type { LabelDirectorRow } from '../../@types/rendering/LabelDirectorRow';
import { COSMO, NEAR0 } from '../../services/engine/frame/slabs';

/**
 * The two label directors, one per slab. 8 px is breathing room around each ink rect. COSMO's
 * 300 ms ramp reads as a fade, not a flicker, and a focus handoff finishes within a tour beat;
 * NEAR0's targets move continuously with distance, so it eases exponentially (τ 100 ms closes
 * ~95% in 300 ms) and snaps within 0.005, so a settled caption stops waking the loop.
 * Both envelope policies stay until one is chosen (plan Task 12). COSMO hides labels nearer
 * than 10 kpc, where its old clip-space path met its fixed near plane.
 */
export const LABEL_DIRECTORS: readonly LabelDirectorRow[] = [
  {
    slab: COSMO,
    declutterPadPx: 8,
    envelope: { mode: 'smoothstepRamp', durationMs: 300 },
    nearHideMpc: 0.01,
  },
  {
    slab: NEAR0,
    declutterPadPx: 8,
    envelope: { mode: 'exponentialApproach', tauMs: 100, settleEps: 0.005 },
  },
];
