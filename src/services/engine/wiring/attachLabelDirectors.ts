/**
 * attachLabelDirectors — (re)wires each Label2D director onto its renderer
 * pair off `state.gpu`. Called from both `initGpu` (first construction) and
 * `buildSwapRenderers` (swap-format rebuild): the director holds direct
 * renderer refs, so skipping this after a rebuild would leave it drawing
 * into destroyed buffers and labels/marker-lines would vanish. One table
 * row per director — `foregroundLabelDirector` is the NEAR0 sibling of
 * `cosmoLabelDirector`, same two-renderer contract, its own renderer pair.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Label2DDirector } from '../../../@types/engine/subsystems/Label2DDirector';
import type { LabelRenderer } from '../../../@types/rendering/LabelRenderer';
import type { MarkerLineRenderer } from '../../../@types/rendering/MarkerLineRenderer';

type LabelDirectorAttachRow = {
  readonly director: (state: EngineState) => Label2DDirector;
  readonly labelRenderer: (state: EngineState) => LabelRenderer | null;
  readonly markerLineRenderer: (state: EngineState) => MarkerLineRenderer | null;
};

const LABEL_DIRECTOR_ATTACH_ROWS: readonly LabelDirectorAttachRow[] = [
  {
    director: (state) => state.subsystems.cosmoLabelDirector,
    labelRenderer: (state) => state.gpu.labelRenderer,
    markerLineRenderer: (state) => state.gpu.markerLineRenderer,
  },
  {
    director: (state) => state.subsystems.foregroundLabelDirector,
    labelRenderer: (state) => state.gpu.foregroundLabelRenderer,
    markerLineRenderer: (state) => state.gpu.foregroundMarkerLineRenderer,
  },
];

export function attachLabelDirectors(state: EngineState): void {
  for (const row of LABEL_DIRECTOR_ATTACH_ROWS) {
    // Non-null: both phases run this only once their renderer pair has just
    // been (re)constructed — same assumption the two call sites made inline
    // before this table existed.
    row.director(state).attachRenderers(row.labelRenderer(state)!, row.markerLineRenderer(state)!);
  }
}
