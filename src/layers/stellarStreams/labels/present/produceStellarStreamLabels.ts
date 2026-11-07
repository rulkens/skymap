/**
 * produceStellarStreamLabels — one NEAR0 caption per stream at its anchor, camera-relative (the
 * NEAR0 director's f32 matrix has no room for absolute Mpc). Only streams at least
 * `STELLAR_STREAM_LABEL_MIN_PX` long on screen get one (83 crowd the halo), unless hovered or
 * selected; ranked by that apparent length, so the declutter keeps the long streams. The pick word
 * is the ribbons', so a click on a caption resolves through the selection row unchanged. A stream
 * focus recedes every other caption out of the pick, its own staying. Nothing until the meta lands.
 */

import type { Label2D } from '../../../../@types/rendering/Label2D';
import type { LayerScreenLabel } from '../../../../@types/engine/layer/LayerScreenLabel';
import type { StellarStreamsRuntime } from '../../@types/StellarStreamsRuntime';
import type { StellarStreamRef } from '../../selection/@types/StellarStreamRef';
import { streamTintRgb } from '../utils/streamTintRgb';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { isKind } from '../../../../utils/selection/isKind';
import { isSubjectPickableUnderFocus } from '../../../../utils/structure/isSubjectPickableUnderFocus';
import {
  STELLAR_STREAM_LABEL_ALPHA,
  STELLAR_STREAM_LABEL_MIN_PX,
  STELLAR_STREAM_LABEL_STYLE,
} from '../data/stellarStreamLabelStyle.constants';

export function produceStellarStreamLabels(
  runtime: Pick<StellarStreamsRuntime, 'meta' | 'pickCode'>,
): LayerScreenLabel<'stellarStream'>['produceLabels'] {
  return (state, ctx, fade) => {
    const meta = runtime.meta();
    if (meta === null) return { labels: [], awake: false };
    const { hover, select } = state.selection;
    const named = (slug: string): boolean =>
      [hover, select].some((r) => isKind<StellarStreamRef>(r, 'stellarStream') && r.slug === slug);
    const [cx, cy, cz] = ctx.drawCamPos;
    const labels = meta.flatMap((m, i): Label2D[] => {
      const [x, y, z] = m.anchorMpc;
      const distanceMpc = Math.hypot(x - cx, y - cy, z - cz);
      const lengthPx =
        ((m.lengthKpc * SCALE_UNITS.KPC_TO_MPC) / Math.max(distanceMpc, 1e-12)) * ctx.drawPxPerRad;
      if (lengthPx < STELLAR_STREAM_LABEL_MIN_PX && !named(m.id)) return [];
      const subjectId = packSelection(runtime.pickCode, i + PICK_SENTINEL_OFFSET);
      const label: Label2D = {
        id: `stream:${m.id}`,
        text: m.names[0]!,
        font: 'cormorant',
        pixelSize: 0,
        worldPos: [x - cx, y - cy, z - cz],
        ...STELLAR_STREAM_LABEL_STYLE,
        color: [...streamTintRgb(m.colourT), STELLAR_STREAM_LABEL_ALPHA],
        fadeAlpha: fade,
        alignX: 'center',
        alignY: 'center',
        declutterPriority: lengthPx,
        pickId: isSubjectPickableUnderFocus(subjectId, m.anchorMpc, ctx.snapshot)
          ? subjectId
          : undefined,
        subjectId,
      };
      return [label];
    });
    return { labels, awake: false };
  };
}
