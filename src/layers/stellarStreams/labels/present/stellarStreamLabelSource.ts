/**
 * stellarStreamLabelSource — one NEAR0 label per stream at its anchor, tinted by the stream's
 * colourT. The subject is the stream's length (radius = half of it), so the style's appear band
 * keeps short streams unlabelled (83 crowd the halo) and ranks the long ones first. The pick is
 * the ribbons', so a click on a label selects its stream. Nothing until the meta lands.
 */

import type { StellarStreamsRuntime } from '../../@types/StellarStreamsRuntime';
import { labelSource } from '../../../../utils/labels/labelSource';
import { NEAR0 } from '../../../../services/engine/frame/slabs';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { streamTintRgb } from '../utils/streamTintRgb';
import { STELLAR_STREAM_LABEL_ALPHA } from '../data/stellarStreamLabelStyle.constants';

export function stellarStreamLabelSource(
  runtime: Pick<StellarStreamsRuntime, 'meta' | 'pickCode'>,
) {
  return labelSource({
    slab: NEAR0,
    toggle: 'stellarStream',
    style: 'stellarStream',
    changes: () => runtime.meta(),
    items: () => runtime.meta() ?? [],
    describe: (m, i) => ({
      text: m.names[0]!,
      position: [...m.anchorMpc],
      subjectRadiusMpc: (m.lengthKpc * SCALE_UNITS.KPC_TO_MPC) / 2,
      color: [...streamTintRgb(m.colourT), STELLAR_STREAM_LABEL_ALPHA],
      pick: { code: runtime.pickCode, index: i },
    }),
  });
}
