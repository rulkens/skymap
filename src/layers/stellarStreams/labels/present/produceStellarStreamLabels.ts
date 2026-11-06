/**
 * produceStellarStreamLabels — one NEAR0 caption per stream at its anchor, camera-relative (the
 * NEAR0 director's f32 matrix has no room for absolute Mpc). Ranked by apparent length, so the
 * declutter keeps the long streams. The pick word is the streak stamp's, so a click on a caption
 * resolves through the selection row unchanged. Nothing until the meta lands.
 */

import type { Label2D } from '../../../../@types/rendering/Label2D';
import type { LayerScreenLabel } from '../../../../@types/engine/layer/LayerScreenLabel';
import type { StellarStreamsRuntime } from '../../@types/StellarStreamsRuntime';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { isPickableUnderFocus } from '../../../../utils/structure/isPickableUnderFocus';
import { STELLAR_STREAM_LABEL_STYLE } from '../data/stellarStreamLabelStyle.constants';

export function produceStellarStreamLabels(
  runtime: Pick<StellarStreamsRuntime, 'meta' | 'pickCode'>,
): LayerScreenLabel<'stellarStream'>['produceLabels'] {
  return (_state, ctx, fade) => {
    const meta = runtime.meta();
    if (meta === null) return { labels: [], awake: false };
    const [cx, cy, cz] = ctx.drawCamPos;
    const labels = meta.map((m, i): Label2D => {
      const [x, y, z] = m.anchorMpc;
      const distanceMpc = Math.hypot(x - cx, y - cy, z - cz);
      const subjectId = packSelection(runtime.pickCode, i + PICK_SENTINEL_OFFSET);
      return {
        id: `stream:${m.id}`,
        text: m.names[0]!,
        font: 'cormorant',
        pixelSize: 0,
        worldPos: [x - cx, y - cy, z - cz],
        ...STELLAR_STREAM_LABEL_STYLE,
        fadeAlpha: fade,
        alignX: 'center',
        alignY: 'center',
        declutterPriority:
          ((m.lengthKpc * SCALE_UNITS.KPC_TO_MPC) / Math.max(distanceMpc, 1e-12)) *
          ctx.drawPxPerRad,
        pickId: isPickableUnderFocus(m.anchorMpc, ctx.snapshot.focus) ? subjectId : undefined,
        subjectId,
      };
    });
    return { labels, awake: false };
  };
}
