/**
 * produceZoneOfAvoidanceLettering — the sole `Label3DProducer` today: the
 * curved "Zone of Avoidance" caption riding the galactic plane. Reads the
 * same `deriveZoneOfAvoidanceLiveness` gate the band pass reads, so band
 * and lettering can never independently go stale, and folds
 * `LABEL_RADIUS_MPC`/`LABEL_EM_MPC` into one placeholder home instead of two.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { Label3DProducerOutput } from '../../../@types/engine/subsystems/Label3DProducerOutput';
import type { Label3D } from '../../../@types/rendering/Label3D';
import { deriveZoneOfAvoidanceLiveness } from '../frame/zoneOfAvoidanceLiveness';
import { GAL_X_EQ, GAL_Z_EQ } from '../../../data/orientation/orientationFrames';
import { FONT_IDS } from '../../../data/fonts';
import {
  ZONE_OF_AVOIDANCE_LABEL_TEXT,
  ZONE_OF_AVOIDANCE_LABEL_REPEAT_COUNT,
} from '../../../data/zoneOfAvoidance/zoneOfAvoidanceLabelText';

/** Curved-lettering circle radius, Mpc — visual-pass placeholder. */
const LABEL_RADIUS_MPC = 40;

/**
 * Physical em-height of the curved lettering, in Mpc — a fixed real-world
 * size (like a giant sign at `LABEL_RADIUS_MPC`), so its ANGULAR size scales
 * inversely with `LABEL_RADIUS_MPC` the same way any physical object would.
 * Visual-pass placeholder: at `LABEL_RADIUS_MPC` = 40 this gives ~2.9° letter
 * height and ~27° label width, comfortably inside the 120° gap between the
 * 3 repeats.
 */
const LABEL_EM_MPC = 2;

export function produceZoneOfAvoidanceLettering(
  state: EngineState,
  ctx: ReadyFrameContext,
): Label3DProducerOutput {
  const fadeAlpha = deriveZoneOfAvoidanceLiveness(state, ctx);
  if (fadeAlpha === null) return { labels: [], awake: false };

  const tuning = state.settings.zoneOfAvoidance;
  const label: Label3D = {
    id: 'zoneOfAvoidance',
    text: ZONE_OF_AVOIDANCE_LABEL_TEXT,
    font: FONT_IDS[0]!,
    placement: {
      center: [0, 0, 0],
      planeNormal: GAL_Z_EQ,
      referenceDir: GAL_X_EQ,
      radiusMpc: LABEL_RADIUS_MPC,
      startAngleRad: 0,
    },
    emMpc: LABEL_EM_MPC,
    repeatCount: ZONE_OF_AVOIDANCE_LABEL_REPEAT_COUNT,
    color: [tuning.labelColor[0], tuning.labelColor[1], tuning.labelColor[2], 1],
    fadeAlpha,
  };
  return { labels: [label], awake: false };
}
