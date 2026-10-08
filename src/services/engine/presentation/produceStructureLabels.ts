/**
 * produceStructureLabels — per-frame text labels for the extended structures
 * (cluster / supercluster / void), read from `structureStore`.
 *
 * Reads `state.data.structures` and emits structure labels — applying the
 * marker close-approach / far-distance fades, the featured + visibility gates,
 * and the anchor (ring centre, or just above the ring's drawn top for the
 * categories whose style asks for it). Famous-galaxy labels come from
 * `produceFamousGalaxyLabels` instead — a split that also carries the deep-zoom
 * exemption: THIS producer rides the `surveyDeepZoom` band (structure labels
 * dissolve with their rings on the descent into the solar system), while
 * famous labels stay visible with the famous points they name. The exemption
 * is per-producer, not per-label — no flag to thread through the loop.
 *
 * ### Per-category opacity × focused-exempt recession bakes into fadeAlpha
 *
 * Each label's final `fadeAlpha` is the distance fade multiplied by two
 * composed strands (see `focusRecession.ts`): the per-category toggle's
 * opacity (`opacityOf({labelLayer, structure, item})`, read from the
 * FadeRegistry) and the focus recession factor. The authoritative gate is the
 * `structures.items[cat].labelEnabled` boolean: a category that is both
 * DISABLED and fully faded (opacity 0) is skipped wholesale — the only
 * legitimate all-or-nothing skip — while a still-fading disabled category keeps
 * emitting so its fade-out tail draws to completion. The FOCUSED structure's
 * own label is exempt from recession (factor 1): a faded ring never carries a
 * bright label, but the thing under inspection keeps its label. The marker pass
 * (`produceStructureMarkers`) bakes the mirror of this into each ring's alpha.
 *
 * ### Pure reader of the per-category opacity
 *
 * The producer only READS `fades.opacityOf({labelLayer, structure, item})`
 * — the visibility bridge (`syncVisibilityFades`) is the sole writer of each
 * category's intent opacity, seeding and ramping it from the category's
 * `labelEnabled` setting. The producer never drives a fade of its own.
 *
 * ### No declutter here — the director owns it
 *
 * A producer-local screen-space declutter could only de-collide
 * structure-vs-structure labels; it couldn't see the famous or you-are-here
 * labels. This producer therefore emits EVERY surviving candidate, tagging each
 * with a
 * `prominencePx` (the ring's apparent radius) as the declutter sort key, and
 * the `label2DDirector` declutters across ALL producers in its merge
 * step. Decluttering by apparent size (not a flat significance) keeps the
 * large structure under the camera while a small distant label sweeping past
 * during an orbit yields, instead of culling-then-releasing the structure
 * being inspected (flicker).
 */

import type { Label2D } from '../../../@types/rendering/Label2D';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Label2DProducerOutput } from '../../../@types/engine/subsystems/Label2DProducerOutput';
import { STRUCTURE_ID_CODES } from '../../../data/structure/structureIds';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';
import { MARKER_RADIUS_RETUNE } from '../../../data/markerRadiusRetune';
import { STRUCTURE_LABEL_ABOVE_GAP_PX } from '../../../data/structureLabelAboveGapPx';
import { aboveRingAnchor } from '../../../utils/labels/aboveRingAnchor';
import { ringUpDirection } from '../../../utils/labels/ringUpDirection';
import { imagePlaneBasis } from '../../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../../utils/camera/frameUp';
import { orbitForwardOf } from '../../../utils/camera/orbitForwardOf';
import {
  STRUCTURE_MARKER_STYLES,
  HOVERED_LABEL_WHITEN,
  SELECTED_LABEL_WHITEN,
} from './structureMarkerStyles';
import { lerp } from '../../../utils/math/lerp';
import { focusRecession } from './focusRecession';
import { structureIdOf } from '../helpers/structureIdOf';
import { wrapLabelName } from '../../../utils/format/wrapLabelName';
import { fadeBand } from '../../../utils/math/fadeBand';
import { isPickableUnderFocus } from '../../../utils/structure/isPickableUnderFocus';
import { anyFadeBandVisible } from '../../../utils/math/anyFadeBandVisible';
import type { StructureScale } from '../../../@types/data/structure/StructureScale';
import { SLAB_BY_STRUCTURE_SCALE } from '../../../data/structure/slabByStructureScale';
import { STRUCTURE_IDS_BY_SCALE } from '../../../data/structure/structureIdsByScale';
import { STRUCTURE_VISIBLE_BANDS_BY_SCALE } from './structureVisibleBands';

export function produceStructureLabels(
  state: EngineState,
  ctx: FrameView,
  scale: StructureScale,
): Label2DProducerOutput {
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

  // Snapshot the registry + clock + focused id once so every category reads
  // the same instant and the same focus state.
  const fades = state.subsystems.fades;
  const now = ctx.snapshot.nowMs;
  const focusedStructureId = structureIdOf(state.selection.focus);
  // Ring and label carry the same pick id, so hovering either lights both.
  const hoveredStructureId = structureIdOf(state.selection.hover);

  // Clip-owned transient opacity for structure labels — hoisted outside the loop
  // because ALL structure-label categories (`{ kind: 'labelLayer', layer: 'structure',
  // item: any }`) collapse to the same `'structureLabel'` key. Returns 1 when
  // no clip is playing. We address the key directly since `fadeIdToVisibilityKey`
  // maps every structure-label FadeId to this value without discrimination.
  const clipFactor = state.subsystems.clipPlayer.clipOpacityOf('structureLabel', now);

  // focusedOnly mode: only the focused structure's label draws — a hard
  // suppression, not a recession. With nothing (or a non-structure) focused,
  // no structure labels draw at all.
  const focusedOnly = state.settings.labels.focusedOnly;

  const structures = state.data.structures;
  const scaleIds = STRUCTURE_IDS_BY_SCALE[scale];
  // The NEAR0 director projects camera-relative anchors (its f32 matrix has no
  // room for absolute Mpc positions); the COSMO one takes them absolute.
  const [ox, oy, oz] = SLAB_BY_STRUCTURE_SCALE[scale] === 'near0' ? ctx.drawCamPos : [0, 0, 0];
  // Screen-up in world axes; the same direction applies in both frames. Only the
  // 'above' categories lift along it.
  const screenUp = scaleIds.some((id) => STRUCTURE_MARKER_STYLES[id].labelPlacement === 'above')
    ? imagePlaneBasis(orbitForwardOf(ctx.cam), ctx.cam.roll ?? 0, frameUp(ctx.cam.upBasis)).up
    : null;
  for (const p of structures.all()) {
    if (!scaleIds.includes(p.category)) continue;
    if (focusedOnly && p.id !== focusedStructureId) continue;
    // Per-category label opacity: the category toggle's fade, read from the
    // registry. The authoritative gate is the boolean — emit while the
    // category's label is enabled OR still fading out. Skip only when it's both
    // disabled AND fully faded (the all-or-nothing case).
    const catOpacity = fades.opacityOf(
      { kind: 'labelLayer', layer: 'structure', item: p.category },
      now,
    );
    const labelEnabled = state.settings.structures.items[p.category].labelEnabled;
    if (!labelEnabled && catOpacity === 0) continue;
    // Featured gate: only the ~25-30 curated anchors earn text; the ~375
    // bulk clusters/SCs still render rings via the marker pass, no label.
    if (!p.featured) continue;
    // Anchor gate: a label needs its ring marker as a visual anchor. Read the
    // ring's OWN gate (the `enabled` boolean + markerLayer fade handle, same as
    // produceStructureMarkers) so the label fades out in lock-step with the ring
    // instead of popping when the category toggles off mid-fade.
    if (
      !state.settings.structures.items[p.category].enabled &&
      fades.opacityOf({ kind: 'structure', id: p.category }, now) === 0
    )
      continue;

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

    // Marker close-approach fade-out applied to the LABEL too. When the ring
    // has grown past markerMaxApparentRadiusPx (cluster fills the viewport)
    // the floating label is just chrome — fading it with the ring hands the
    // view back to the galaxies. Mirrors the smoothstep produceStructureMarkers
    // uses so label + ring disappear together. Render at the WIDER apparent
    // extent, falling back to the core for structures that set only
    // physicalRadiusMpc.
    const markerRadiusMpc = p.apparentRadiusMpc ?? p.physicalRadiusMpc;
    if (distanceMpc > 0) {
      const apRadPx = (markerRadiusMpc / distanceMpc) * pxPerRad;
      prominencePx = apRadPx;
      if (apRadPx > style.markerMaxApparentRadiusPx) {
        const t = Math.min(
          1,
          (apRadPx - style.markerMaxApparentRadiusPx) / style.markerMaxApparentFadeBandPx,
        );
        const markerFadeOut = 1 - t * t * (3 - 2 * t);
        if (markerFadeOut <= 0) continue;
        // No `awake` signal — fadeAlpha is a pure function of camera distance,
        // and camera motion already wakes the loop.
        fadeAlpha = Math.min(fadeAlpha, markerFadeOut);
      }
      // Far-distance fade-out — mirrors the marker min-radius branch so label
      // and ring disappear together at far zoom (without this the label would
      // linger at full alpha after the ring fades).
      if (apRadPx < style.markerMinApparentRadiusPx + style.markerMinApparentFadeBandPx) {
        let minFadeOut: number;
        if (apRadPx < style.markerMinApparentRadiusPx) {
          minFadeOut = 0;
        } else {
          const t = (apRadPx - style.markerMinApparentRadiusPx) / style.markerMinApparentFadeBandPx;
          minFadeOut = t * t * (3 - 2 * t);
        }
        if (minFadeOut <= 0) continue;
        fadeAlpha = Math.min(fadeAlpha, minFadeOut);
      }
    }

    // Bake the resolved layer opacity into fadeAlpha on top of the distance
    // fade: catOpacity (toggle fade) × recession (focus fade) × clipFactor
    // (clip-owned transient dimming) × bandFade (the category's visibility band —
    // labels dissolve with their rings on descent). The focused
    // structure's own label is exempt from recession — a faded ring never
    // carries a bright label, but the thing under inspection keeps its label.
    // clipFactor is NOT exempted for the focused structure: a tour cue that
    // dims all structure labels is expected to dim even the focused one (the
    // tour controls the whole scene). Nothing is exempt from the band —
    // at solar-system zoom even the focused structure's label is chrome.
    const recession =
      p.id === focusedStructureId
        ? 1
        : focusRecession(
            { kind: 'labelLayer', layer: 'structure', item: p.category },
            ctx.snapshot.focusBlend,
          );
    fadeAlpha *= catOpacity * recession * clipFactor * bandFade;

    // Rings that stay on screen at large sizes would sit under a centred
    // label, so those labels hang just above the ring's drawn top instead.
    const above = screenUp !== null && style.labelPlacement === 'above';

    // Selected wins over hovered: the later assignment is the stronger cue.
    let whiten = 0;
    if (p.id === hoveredStructureId) whiten = HOVERED_LABEL_WHITEN;
    if (p.id === focusedStructureId) whiten = SELECTED_LABEL_WHITEN;

    labels.push({
      id: p.id,
      // Byte-identical to what `ringPick.wesl` writes for this structure's own
      // marker ring — the category's source code over the per-category index,
      // both read from the store's single-sourced `categoryIndexOf`.
      pickId: isPickableUnderFocus(p.worldPos, ctx.snapshot.focus)
        ? packSelection(
            STRUCTURE_ID_CODES[p.category],
            structures.categoryIndexOf(p.category, p.id) + PICK_SENTINEL_OFFSET,
          )
        : undefined,
      worldPos: above
        ? aboveRingAnchor(
            [p.worldPos[0] - ox, p.worldPos[1] - oy, p.worldPos[2] - oz],
            ringUpDirection(screenUp, [dx, dy, dz]),
            markerRadiusMpc * MARKER_RADIUS_RETUNE,
            (STRUCTURE_LABEL_ABOVE_GAP_PX * distanceMpc) / pxPerRad,
          )
        : [p.worldPos[0] - ox, p.worldPos[1] - oy, p.worldPos[2] - oz],
      // Long names ("Perseus-Pisces Supercluster") break onto two balanced
      // lines here, at the presentation seam — the store keeps the unwrapped
      // name for the palette / InfoCard, and the layout just honours the '\n'.
      text: wrapLabelName(p.name),
      font: 'cormorant',
      pixelSize: 0, // unused — superseded by the worldEm sizing model
      color: [
        lerp(style.labelColor[0], 1, whiten),
        lerp(style.labelColor[1], 1, whiten),
        lerp(style.labelColor[2], 1, whiten),
        style.labelColor[3],
      ],
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
}
