/**
 * produceStructureLabels — per-frame text labels for the extended structures
 * (cluster / supercluster / void), read from `structureStore`.
 *
 * Reads `state.data.structures` and emits structure labels — applying the
 * marker close-approach / far-distance fades, the featured + visibility gates,
 * and the ring-centre anchor. Famous-galaxy labels come from
 * `produceFamousLabels` instead.
 *
 * ### Per-category opacity × focused-exempt recession bakes into fadeAlpha
 *
 * Each label's final `fadeAlpha` is the distance fade multiplied by two
 * composed strands (see `focusRecession.ts`): the per-category toggle's
 * opacity (`opacityOf({labelLayer, poi, category})`, read from the
 * FadeRegistry) and the focus recession factor. A category whose opacity is
 * exactly 0 is skipped wholesale — the only legitimate all-or-nothing skip.
 * The FOCUSED structure's own label is exempt from recession (factor 1): a
 * faded ring never carries a bright label, but the thing under inspection
 * keeps its label. The marker pass (`produceStructureMarkers`) bakes the
 * mirror of this into each ring's alpha.
 *
 * ### This producer owns the per-category load-in fade
 *
 * The first time a category emits a (visible) label, the producer fires its
 * `fadeTo(handle, 1)` once. The director used to fire a single category-less
 * poi load-in; that moved here so each category ramps in independently,
 * mirroring how the famous-galaxy layer fires its own load-in on first emit.
 *
 * ### No declutter here — the director owns it
 *
 * A producer-local screen-space declutter could only de-collide
 * structure-vs-structure labels; it couldn't see the famous or you-are-here
 * labels. This producer therefore emits EVERY surviving candidate, tagging each
 * with a
 * `prominencePx` (the ring's apparent radius) as the declutter sort key, and
 * the `labelDirectorSubsystem` declutters across ALL producers in its merge
 * step. Decluttering by apparent size (not a flat significance) keeps the
 * large structure under the camera while a small distant label sweeping past
 * during an orbit yields, instead of culling-then-releasing the structure
 * being inspected (flicker).
 */

import type { Label } from '../../../@types/rendering/Label';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { LabelProducerOutput } from '../../../@types/engine/subsystems/LabelProducerOutput';
import type { StructureCategory } from '../../../@types/engine/data/StructureCategory';
import { STRUCTURE_POI_STYLES } from './structurePoiStyles';
import { getLabelStyleOverride } from '../labelStyleOverride';
import { focusRecession } from './focusRecession';
import { FADE_IN_DURATION_MS } from '../../animation/fadeController';

// Per-category load-in latch. The producer is a bare function (not a closure
// over subsystem state like the director), so the once-per-category one-shot
// has nowhere to live except module scope. Each category fires its load-in
// `fadeTo(1)` the first time it emits a visible label. Because the loop reaches
// this only AFTER the `catOpacity === 0` skip, a disabled category never fires
// (so a toggled-off category is never wrongly revealed); a visible category
// registered at 1 ramps `fadeTo(1)` as a no-op, fired for symmetry with the
// famous-galaxy layer's first-emit load-in. Reset between tests via
// `__resetStructureLabelLoadIn`.
const loadInFired = new Set<StructureCategory>();

/** Test-only: clear the module-level load-in latch between unit cases. */
export function __resetStructureLabelLoadIn(): void {
  loadInFired.clear();
}

export function produceStructureLabels(
  state: EngineState,
  ctx: ReadyFrameContext,
): LabelProducerOutput {
  const labels: Label[] = [];

  // Recover the vertical fov from the per-frame `drawPxPerRad`:
  //   drawPxPerRad = canvasSize.height / (2 * tan(fovY/2))
  // ⇒ fovY = 2 * atan(canvasSize.height / (2 * drawPxPerRad))
  // matching the scalar every other per-frame consumer reads.
  const halfH = ctx.canvasSize.height * 0.5;
  const fovYRad = 2 * Math.atan(halfH / ctx.drawPxPerRad);
  const pxPerRad = halfH / Math.tan(fovYRad * 0.5);
  const [cx, cy, cz] = ctx.drawCamPos;

  // Snapshot the live-tuning override once so it stays consistent across the
  // loop. See `labelStyleOverride.ts`.
  const override = getLabelStyleOverride();

  // Snapshot the registry + clock + focused id once so every category reads
  // the same instant and the same focus state.
  const fades = state.subsystems.fades;
  const now = performance.now();
  const foc = state.subsystems.selection.focused();
  const focusedPoiId = foc !== null && foc.kind === 'poi' ? foc.id : null;

  const structures = state.data.structures;
  for (const p of structures.all()) {
    // Per-category label opacity: the category toggle's fade, read from the
    // registry (not the store's labelVisible flag). 0 is the all-or-nothing
    // skip — a disabled category emits no labels and never fires its load-in.
    const catOpacity = fades.opacityOf(
      { kind: 'labelLayer', layer: 'poi', category: p.category },
      now,
    );
    if (catOpacity === 0) continue;
    // Featured gate: only the ~25-30 curated anchors earn text; the ~375
    // bulk clusters/SCs still render rings via the marker pass, no label.
    if (!p.featured) continue;
    // Anchor gate: a structure label needs its ring marker as a visual
    // anchor (a label without a ring reads as orphaned text).
    if (!structures.markerVisible(p.category)) continue;

    const style = STRUCTURE_POI_STYLES[p.category];

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
    if (distanceMpc > 0.001) {
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
    // fade: catOpacity (toggle fade) × recession (focus fade). The focused
    // structure's own label is exempt from recession — a faded ring never
    // carries a bright label, but the thing under inspection keeps its label.
    const recession =
      p.id === focusedPoiId
        ? 1
        : focusRecession(
            { kind: 'labelLayer', layer: 'poi', category: p.category },
            ctx.focusBlend,
          );
    fadeAlpha *= catOpacity * recession;

    // Per-category load-in: fire the load-in fade once on this category's first
    // emitted (visible) label. Reached only for enabled categories (the
    // catOpacity === 0 skip above), so a toggled-off category never fires.
    if (!loadInFired.has(p.category)) {
      loadInFired.add(p.category);
      void fades.fadeTo(
        { kind: 'labelLayer', layer: 'poi', category: p.category },
        1,
        FADE_IN_DURATION_MS,
      );
    }

    // Per-POI override fields: only structures whose category matches the
    // override's target adopt the outline values; others keep the default.
    const overrideFields =
      override.targetCategory === p.category
        ? { outlineColor: override.outlineColor, outlineEmFrac: override.outlineEmFrac }
        : {};

    labels.push({
      id: p.id,
      // Structures anchor at the ring centre, centred on both axes (only
      // famous galaxies lift their label off the dot).
      worldPos: [p.worldPos[0], p.worldPos[1], p.worldPos[2]],
      text: p.name,
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
      prominencePx,
      ...overrideFields,
    });
  }

  // Structures emit no anchor lines (only lifted famous labels do). No
  // declutter here — the director de-collides across all producers.
  return { labels, lines: [], awake: false };
}
