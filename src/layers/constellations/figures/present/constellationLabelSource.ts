/**
 * constellationLabelSource — one NEAR0 label per stick figure, its Latin name at the figure's
 * anchor. Anchors ship in parsecs from the render origin, scaled to world Mpc as the segments
 * are (`buildConstellationInstances`). The anchor is empty space, so no radius and no pick; the
 * names' label entry carries the figures' distance band. A released slot drops every name.
 */

import type { ConstellationsRuntime } from '../../@types/ConstellationsRuntime';
import { labelSource } from '../../../../utils/labels/labelSource';
import { NEAR0 } from '../../../../services/engine/frame/slabs';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';

export function constellationLabelSource(runtime: Pick<ConstellationsRuntime, 'slot'>) {
  const artifact = () => runtime.slot.committed()?.value;
  return labelSource({
    slab: NEAR0,
    toggle: 'constellations',
    style: 'constellation',
    changes: artifact,
    items: () => artifact()?.constellations ?? [],
    describe: (figure) => ({
      text: figure.name,
      position: [
        figure.labelAnchorPc[0] * SCALE_UNITS.PC_TO_MPC - RENDER_ORIGIN_MPC[0],
        figure.labelAnchorPc[1] * SCALE_UNITS.PC_TO_MPC - RENDER_ORIGIN_MPC[1],
        figure.labelAnchorPc[2] * SCALE_UNITS.PC_TO_MPC - RENDER_ORIGIN_MPC[2],
      ],
    }),
  });
}
