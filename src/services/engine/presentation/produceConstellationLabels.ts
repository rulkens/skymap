/**
 * produceConstellationLabels — per-frame text labels naming the true-3D
 * constellation stick figures, one Latin name per figure at its
 * `labelAnchorPc`.
 *
 * Reads the demand-loaded `ConstellationsArtifact` straight off the
 * `constellations` asset slot — the same CPU-resident value the
 * `constellationsLayer` pass uploads to the GPU, and the same commit-less slot
 * `constellationRenderer` draws from. (There is no `state.data.constellations`
 * mirror; the artifact lives only on the slot, so this producer reads it there,
 * the way `produceStructureLabels` reads `state.data.structures`.)
 *
 * ### fadeAlpha rides the layer's fade, not a label-local one
 *
 * Each label's `fadeAlpha` is the layer's distance band
 * (`fadeBand(SCALE_FADE_BANDS.constellations, camDistMpc)`) multiplied by the
 * layer's fade-registry opacity (`fades.opacityOf({ kind: 'constellations' })`)
 * — so the names dissolve in lock-step with the stick figures on both the
 * ENABLE/DISABLE toggle and the fly-away distance recession, with no
 * label-specific fade to keep in sync. The producer is a pure READER of the
 * fade opacity; the visibility bridge is its sole writer.
 *
 * ### No declutter here — the director owns it
 *
 * Every surviving name is emitted, tagged with a flat annotation-tier
 * `prominencePx` so the `labelDirector` de-collides constellation names against
 * the structure / famous / "You are here" labels in its shared merge step. A
 * producer-local declutter could only see constellation-vs-constellation
 * collisions — see `produceStructureLabels` for the same rationale.
 */

import type { Label } from '../../../@types/rendering/Label';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { LabelProducerOutput } from '../../../@types/engine/subsystems/LabelProducerOutput';
import type { Vec3 } from '../../../@types/math/Vec3';
import {
  CONSTELLATION_LABEL_STYLE,
  CONSTELLATION_LABEL_PROMINENCE_PX,
} from './constellationLabelStyle';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { fadeBand } from '../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from './scaleFadeBands';

export function produceConstellationLabels(
  state: EngineState,
  ctx: ReadyFrameContext,
): LabelProducerOutput {
  // Independent labels gate: turning the figure NAMES off removes them while the
  // stick figures keep drawing. (The lines' own master toggle lives on the layer
  // fade below, which these labels also multiply by — so lines off ⇒ labels off
  // regardless; this only removes labels while lines stay on.)
  if (!state.settings.constellations.labels) return { labels: [], lines: [], awake: false };

  // The artifact is CPU-resident on the slot; nothing to draw until it's ready.
  const slot = state.assetSlots.constellations;
  if (slot === null) return { labels: [], lines: [], awake: false };
  const slotState = slot.state();
  if (slotState.kind !== 'ready') return { labels: [], lines: [], awake: false };

  // The layer's per-frame opacity: the distance band (camera receding out of
  // the neighbourhood) times the fade-registry toggle opacity. One scalar,
  // identical for every figure this frame — hoisted out of the loop. At 0 the
  // whole layer is invisible, so emit nothing (the "opacity 0 ⇒ no render"
  // house rule the pass gates on).
  const now = ctx.nowMs;
  const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
  const distanceFade = fadeBand(SCALE_FADE_BANDS.constellations, camDistMpc);
  const layerOpacity = state.subsystems.fades.opacityOf({ kind: 'constellations' }, now);
  const fadeAlpha = distanceFade * layerOpacity;
  if (fadeAlpha <= 0) return { labels: [], lines: [], awake: false };

  const style = CONSTELLATION_LABEL_STYLE;
  const pcToMpc = SCALE_UNITS.PC_TO_MPC;

  const labels: Label[] = [];
  for (const figure of slotState.value.constellations) {
    // Anchor: the artifact ships it in parsecs (near-field stellar scale); the
    // labels project through the same NEAR0-origin world Mpc the stick-figure
    // segments are scaled into (buildConstellationInstances), so convert here
    // through the single PC_TO_MPC source of truth.
    const worldPos: Vec3 = [
      figure.labelAnchorPc[0] * pcToMpc,
      figure.labelAnchorPc[1] * pcToMpc,
      figure.labelAnchorPc[2] * pcToMpc,
    ];
    labels.push({
      id: figure.name,
      worldPos,
      // The Latin name verbatim — no abbreviation in v1.
      text: figure.name,
      font: 'cormorant',
      pixelSize: 0, // unused — superseded by the worldEm sizing model
      color: [...style.labelColor],
      worldEmMpc: style.worldEmMpc,
      minPixelSize: style.minPixelSize,
      maxPixelSize: style.maxPixelSize,
      fadeAlpha,
      alignX: 'center',
      alignY: 'center',
      outlineColor: [...style.outlineColor],
      outlineEmFrac: style.outlineEmFrac,
      prominencePx: CONSTELLATION_LABEL_PROMINENCE_PX,
    });
  }

  // No anchor lines, no declutter here — the director de-collides across every
  // producer. No `awake`: fadeAlpha is a pure function of camera distance +
  // the fade registry, both of which wake the loop themselves.
  return { labels, lines: [], awake: false };
}
