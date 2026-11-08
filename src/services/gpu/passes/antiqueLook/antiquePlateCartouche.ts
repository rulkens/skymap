/**
 * antiquePlateCartouche — this frame's title cartouche: the plate's title, the
 * frame its kind of plate is set in (`ANTIQUE_TITLE_CARTOUCHES`), where that
 * frame goes (`fitAntiqueCartouche`, clear of the open panels and of the subject:
 * the titled globe's disc, rings included, and the plate's centre) and how
 * strongly each prints. The one placement the plate draws and the label director
 * keeps names off.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { AntiqueCartouche } from '../../../../@types/rendering/AntiqueCartouche';
import type { AntiqueSheetAnchor } from '../../../../@types/rendering/AntiqueSheetAnchor';
import type { AntiqueTitleKey } from '../../../../@types/rendering/AntiqueTitleKey';
import type { ScreenDiscPx } from '../../../../@types/rendering/ScreenDiscPx';
import type { ScreenRectPx } from '../../../../@types/rendering/ScreenRectPx';
import { ANTIQUE_CARTOUCHES } from '../../../../data/rendering/antiqueCartouches';
import {
  ANTIQUE_REFERENCE_HEIGHT_CSS,
  ANTIQUE_REGIME_MPC,
} from '../../../../data/rendering/antiqueLook';
import { ANTIQUE_ORNAMENT_ATLAS } from '../../../../data/rendering/antiqueOrnamentAtlas';
import { ANTIQUE_TITLE_CARTOUCHES } from '../../../../data/rendering/antiqueTitleCartouches';
import { projectDirToPx } from '../../../../utils/camera/projection/projectDirToPx';
import { viewBasis } from '../../../../utils/camera/projection/viewBasis';
import { fitAntiqueCartouche } from '../../../../utils/gpu/antiqueLook/fitAntiqueCartouche';
import { antiquePlateTitle } from '../../../../utils/gpu/antiqueLook/antiquePlateTitle';
import { smoothstep } from '../../../../utils/math/smoothstep';
import { sheetAnchorCentre } from '../../../../utils/render/sheetAnchorCentre';
import type { antiqueTitleGlobe } from './antiqueTitleGlobe';

/** The plate's centre the subject's name and figure sit at, as a share of the canvas's short side. */
const CENTRE_SHARE = 0.15;
/** Shrunk below this share of its authored size, the cartouche sets its title compact (a phone's). */
const COMPACT_BELOW = 0.7;

export function antiquePlateCartouche(
  ctx: FrameView,
  globe: ReturnType<typeof antiqueTitleGlobe>,
  covers: readonly ScreenRectPx[],
): {
  readonly cartouche: AntiqueCartouche;
  readonly anchor: AntiqueSheetAnchor;
  readonly rectPx: ScreenRectPx;
  readonly title: {
    readonly key: AntiqueTitleKey;
    readonly weight: number;
    /** The name alone, larger: the imprint would print as a smudge. */
    readonly compact: boolean;
  };
  /** The frame's own strength: it fades only across a change of design. */
  readonly frame: number;
} {
  const size = ctx.canvasSize;
  const unitPx = size.height / ANTIQUE_REFERENCE_HEIGHT_CSS;
  const [x, y, z] = ctx.drawCamPos;
  const cosmos = smoothstep(ANTIQUE_REGIME_MPC[0], ANTIQUE_REGIME_MPC[1], Math.hypot(x, y, z));
  const { key, weight, frame } = antiquePlateTitle({
    cosmos,
    globe,
    centreLonLat: globe?.centreLonLat ?? null,
  });
  const cartouche = ANTIQUE_CARTOUCHES[ANTIQUE_TITLE_CARTOUCHES[key]];
  const sprite = ANTIQUE_ORNAMENT_ATLAS.sprites[cartouche.sprite]!;
  const aspect = sprite.h / sprite.w;
  // The view's axis, where a lens shift puts the focused subject.
  const basis = viewBasis(ctx.cam);
  const axis = projectDirToPx(basis.forward, basis, ctx.frustum, size);
  const subjects: ScreenDiscPx[] = [
    {
      centre: axis ? [axis.x, axis.y] : [size.width / 2, size.height / 2],
      radius: CENTRE_SHARE * Math.min(size.width, size.height),
    },
  ];
  if (globe?.discPx) subjects.push(globe.discPx);
  const anchor = fitAntiqueCartouche({
    anchor: cartouche.anchor,
    aspect,
    size: [size.width, size.height],
    unitPx,
    covers,
    subjects,
  });
  const [cx, cy] = sheetAnchorCentre(anchor, size.width, size.height, unitPx);
  const hw = (anchor.sizeUnits * unitPx) / 2;
  const hh = hw * aspect;
  return {
    cartouche,
    anchor,
    rectPx: { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh },
    title: { key, weight, compact: anchor.sizeUnits < COMPACT_BELOW * cartouche.anchor.sizeUnits },
    frame,
  };
}
