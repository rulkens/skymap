/**
 * attachLabelDirectors — (re)wires each Label2D director onto its renderer
 * off `state.gpu`. Called from both `initGpu` (first construction) and
 * `buildSwapRenderers` (swap-format rebuild): the director holds a direct
 * renderer ref, so skipping this after a rebuild would leave it drawing
 * into destroyed buffers and labels would vanish. One table row per
 * director — `foregroundLabelDirector` is the NEAR0 sibling of
 * `cosmoLabelDirector`, with its own renderer.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Label2DDirector } from '../../../@types/engine/subsystems/Label2DDirector';
import type { Label2D } from '../../../@types/rendering/Label2D';
import type { LabelRenderer } from '../../../@types/rendering/LabelRenderer';
import { textLayoutOf } from '../../gpu/labelLayout/textLayoutOf';

type LabelDirectorAttachRow = {
  readonly director: (state: EngineState) => Label2DDirector;
  readonly labelRenderer: (state: EngineState) => LabelRenderer | null;
};

const LABEL_DIRECTOR_ATTACH_ROWS: readonly LabelDirectorAttachRow[] = [
  {
    director: (state) => state.subsystems.cosmoLabelDirector,
    labelRenderer: (state) => state.gpu.labelRendererCosmo,
  },
  {
    director: (state) => state.subsystems.foregroundLabelDirector,
    labelRenderer: (state) => state.gpu.labelRendererNear,
  },
];

export function attachLabelDirectors(state: EngineState): void {
  const { metricsByFont } = state.gpu.fontAtlases!;
  const measure = (label: Label2D) => textLayoutOf(metricsByFont, label).bbox;
  for (const row of LABEL_DIRECTOR_ATTACH_ROWS) {
    // Non-null: both phases run this only once the renderer has just been
    // (re)constructed.
    row.director(state).attachRenderers(row.labelRenderer(state)!, measure);
  }
}
