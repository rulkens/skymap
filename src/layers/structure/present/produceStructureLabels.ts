/**
 * produceStructureLabels — per-frame labels for every structure category, read
 * from the Layer's store: close-approach / far fades, featured + visibility
 * gates, anchored at the ring centre or just above its drawn top. It rides the
 * `surveyDeepZoom` band, which famous-galaxy labels (their own producer) do not.
 * `fadeAlpha` = distance fade × the category's handed value (label toggle fade
 * × clip, and its ring's clip); a category is skipped only at a
 * value of exactly 0, so its fade-out tail still draws. The label's `of` entry
 * keeps it off while its own ring is off, per category. Every candidate is emitted with
 * `prominencePx` = ring apparent radius: the `label2DDirector` declutters
 * across all producers, so the large structure under the camera wins.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { Label2D } from '../../../@types/rendering/Label2D';
import type { LayerScreenLabel } from '../../../@types/engine/layer/LayerScreenLabel';
import type { StructureStore } from '../@types/StructureStore';
import { structurePickId } from '../../../utils/picking/structurePickId';
import { MARKER_RADIUS_RETUNE } from '../../../data/markerRadiusRetune';
import { STRUCTURE_LABEL_ABOVE_GAP_PX } from '../data/structureLabelAboveGapPx';
import { aboveRingAnchor } from '../../../utils/labels/aboveRingAnchor';
import { imagePlaneBasis } from '../../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../../utils/camera/frameUp';
import { orbitForwardOf } from '../../../utils/camera/orbitForwardOf';
import { STRUCTURE_MARKER_STYLES } from './structureMarkerStyles';
import { structureApparentRadiusFade } from './structureApparentRadiusFade';
import { structureIdOf } from '../../../services/engine/helpers/structureIdOf';
import { wrapLabelName } from '../../../utils/format/wrapLabelName';
import { fadeBand } from '../../../utils/math/fadeBand';
import { isPickableUnderFocus } from '../../../utils/structure/isPickableUnderFocus';
import { anyFadeBandVisible } from '../../../utils/math/anyFadeBandVisible';
import type { StructureScale } from '../../../@types/data/structure/StructureScale';
import { STRUCTURE_IDS_BY_SCALE } from '../../../data/structure/structureIdsByScale';
import { STRUCTURE_VISIBLE_BANDS_BY_SCALE } from './structureVisibleBands';

export function produceStructureLabels(
  store: StructureStore,
  scale: StructureScale,
): LayerScreenLabel<'structure'>['produceLabels'] {
  return (state, ctx, fade) => {
    const labels: Label2D[] = [];

    const pxPerRad = ctx.drawPxPerRad;
    const [cx, cy, cz] = ctx.drawCamPos;

    // Each category's visibility band is keyed on the camera's distance from
    // the heliocentric render origin; labels dissolve with their rings on the
    // descent into the solar system. When every band is at 0 the producer emits
    // nothing — the fade reaches 0 continuously before this skip, so no pop.
    const camDistMpc = Math.hypot(cx, cy, cz);
    if (!anyFadeBandVisible(STRUCTURE_VISIBLE_BANDS_BY_SCALE[scale], camDistMpc))
      return { labels: [], awake: false };

    const focusedStructureId = structureIdOf(state.selection.focus);

    // focusedOnly mode: only the focused structure's label draws — a hard
    // suppression, not a recession. With nothing (or a non-structure) focused,
    // no structure labels draw at all.
    const focusedOnly = state.settings.labels.focusedOnly;

    const scaleIds = STRUCTURE_IDS_BY_SCALE[scale];
    // The NEAR0 director projects camera-relative anchors (its f32 matrix has no
    // room for absolute Mpc positions); the COSMO one takes them absolute.
    const [ox, oy, oz] = scale === 'milkyWay' ? ctx.drawCamPos : [0, 0, 0];
    // Screen-up in world axes; the same direction applies in both frames. Only
    // Milky Way labels lift along it: their rings stay on screen at large sizes.
    const screenUp =
      scale === 'milkyWay'
        ? imagePlaneBasis(orbitForwardOf(ctx.cam), ctx.cam.roll ?? 0, frameUp(ctx.cam.upBasis)).up
        : null;
    for (const p of store.all()) {
      if (!scaleIds.includes(p.category)) continue;
      if (focusedOnly && p.id !== focusedStructureId) continue;
      // The category's handed value carries its label switch, its ring's switch and
      // both fade-out tails; skip only at exactly 0.
      const catFade = fade[p.category];
      if (catFade === 0) continue;
      // Featured gate: only the ~25-30 curated anchors earn text; the ~375
      // bulk clusters/SCs still render rings via the marker pass, no label.
      if (!p.featured) continue;
      const style = STRUCTURE_MARKER_STYLES[p.category];
      const bandFade = fadeBand(style.visibleBand, camDistMpc);

      // Camera distance — for the marker close-approach / far-distance fades.
      const dx = p.worldPos[0] - cx;
      const dy = p.worldPos[1] - cy;
      const dz = p.worldPos[2] - cz;
      const distanceMpc = Math.hypot(dx, dy, dz);

      let fadeAlpha = 1;
      // On-screen prominence (px) — the declutter sort key, the ring's apparent
      // radius (set below). Defaults to 0 so a label setting neither sinks to
      // lowest priority rather than beating real ones.
      let prominencePx = 0;

      // The ring's apparent-size fade applies to the LABEL too: once the ring
      // fills the viewport the floating label is just chrome, and at far zoom it
      // would otherwise linger after its ring is gone. Render at the WIDER
      // apparent extent, falling back to the core for structures that set only
      // physicalRadiusMpc. No `awake` signal — the fade is a pure function of
      // camera distance, and camera motion already wakes the loop.
      const markerRadiusMpc = p.apparentRadiusMpc ?? p.physicalRadiusMpc;
      if (distanceMpc > 0) {
        const apRadPx = (markerRadiusMpc / distanceMpc) * pxPerRad;
        prominencePx = apRadPx;
        fadeAlpha = structureApparentRadiusFade(style, apRadPx);
        if (fadeAlpha <= 0) continue;
      }

      // Bake the handed value into fadeAlpha on top of the distance fade, times
      // bandFade (the category's visibility band — labels dissolve with their rings
      // on descent). Nothing is exempt from the band: at solar-system zoom even the
      // focused structure's label is chrome.
      fadeAlpha *= catFade * bandFade;

      // A centred label would sit under a ring that stays on screen at large
      // sizes, so Milky Way labels hang just above the ring's drawn top.
      const above = screenUp !== null;

      const centre: Vec3 = [p.worldPos[0] - ox, p.worldPos[1] - oy, p.worldPos[2] - oz];
      let anchor = centre;
      if (above) {
        anchor = aboveRingAnchor(
          centre,
          screenUp,
          [dx, dy, dz],
          markerRadiusMpc * MARKER_RADIUS_RETUNE,
          (STRUCTURE_LABEL_ABOVE_GAP_PX * distanceMpc) / pxPerRad,
        );
      }

      // Byte-identical to what `ringPick.wesl` writes for this structure's own
      // marker ring — the category's source code over the per-category index,
      // both read from the store's single-sourced `categoryIndexOf`.
      const subjectId = structurePickId(p.category, store.categoryIndexOf(p.category, p.id));

      labels.push({
        id: p.id,
        pickId: isPickableUnderFocus(p.worldPos, ctx.snapshot.focus) ? subjectId : undefined,
        subjectId,
        worldPos: anchor,
        // Long names ("Perseus-Pisces Supercluster") break onto two balanced
        // lines here, at the presentation seam — the store keeps the unwrapped
        // name for the palette / InfoCard, and the layout just honours the '\n'.
        text: wrapLabelName(p.name),
        font: 'cormorant',
        pixelSize: 0, // unused — superseded by the worldEm sizing model
        color: [...style.labelColor],
        worldEmMpc: style.worldEmMpc,
        minPixelSize: style.minPixelSize,
        maxPixelSize: style.maxPixelSize,
        fadeAlpha,
        alignX: 'center',
        alignY: above ? 'bottom' : 'center',
        outlineColor: [...style.outlineColor],
        outlineEmFrac: style.outlineEmFrac,
        prominencePx,
      });
    }

    // Structures emit no leaders (only lifted famous labels do). No
    // declutter here — the director de-collides across all producers.
    return { labels, awake: false };
  };
}
