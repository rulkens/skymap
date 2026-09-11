/**
 * NEAR0_OVERLAY_CLIP_SCALE — the factor that rescales the NEAR0 overlay's
 * matrices to emit clip METRES. NDC and depth are invariant under a uniform
 * clip scale; any world length a consumer divides by that `w` must carry the
 * same factor.
 * Derivation: docs/RENDERER.md, "NEAR0 overlay clip `w` must stay ≫ 1e-20".
 */

import { SCALE_UNITS } from '../../../data/scaleUnits';

export const NEAR0_OVERLAY_CLIP_SCALE = SCALE_UNITS.MPC_TO_M;
