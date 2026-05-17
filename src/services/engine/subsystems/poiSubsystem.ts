/**
 * poiSubsystem — typed list of named points of interest (clusters,
 * superclusters, famous galaxies, voids) rendered as text labels +
 * optional crosshairs.
 *
 * ### Why one subsystem for four kinds?
 *
 * Clusters, superclusters, individual famous galaxies, and voids all
 * share the same physical surface: anchor a label at a world position,
 * optionally draw a small visual marker so the user can see the
 * precise centre.  The differences (label colour, default pixel size,
 * crosshair size) are data — `category` + a per-category default
 * table.  Splitting into four subsystems would quadruplicate the
 * producer plumbing without adding any clarity.
 *
 * ### Why `POI_STYLES` and `PoiCategory` live together
 *
 * The category union is derived from the const registry via
 * `keyof typeof POI_STYLES`.  This mirrors the FONTS / FontId pattern
 * (PR #132) — co-locating the value and its type union means they
 * cannot drift.  Adding a fifth category is a single edit (add a row
 * to POI_STYLES) that automatically widens `PoiCategory`.
 *
 * ### Crosshair shape
 *
 * Three perpendicular line segments, each `crosshairSizeMpc` long,
 * centred on `worldPos`.  Cheap to render (3 lines per POI), reads
 * clearly at any zoom, and indicates the precise centre regardless
 * of the label's text bounds.  POIs without `crosshairSizeMpc` (e.g.
 * individual galaxies the user clicked on once) get a label only.
 *
 * ### Anchor-offset labels
 *
 * Famous galaxies (and any future category that sets `anchorOffsetPx`
 * on its style) borrow the `youAreHereSubsystem` idiom: the label
 * sits a fixed *pixel* distance above the dot, connected by a short
 * vertical marker line.  The pixel offset is converted to world space
 * per-frame using `(offsetPx / drawPxPerRad) * distanceMpc`, so the
 * gap on screen stays constant regardless of how far the galaxy is
 * from the camera.  These labels use `alignX: 'center'` so the text
 * straddles the line.  Categories that omit `anchorOffsetPx`
 * (cluster, supercluster, void) anchor at the dot with `alignX: 'left'`
 * and rely on the 3-line crosshair for centre indication.
 *
 * ### Fade band
 *
 * `fadeBandPx` is an optional smoothstep ramp above `minApparentSizePx`.
 * Below the threshold the POI is still skipped entirely; inside the
 * band `[min, min + fadeBandPx]` the label and its marker line fade in
 * via smoothstep so the appearance is gradual rather than a hard pop.
 * Above the band: full alpha.  The subsystem reports `awake: true`
 * while any POI is mid-fade so the engine keeps the render loop
 * spinning through the transition.
 *
 * ### Immutability
 *
 * `setPois` takes a readonly array and stores a defensive copy via
 * spread so external mutation can't bleed in.  `setCategoryVisible`
 * replaces the per-category visibility record wholesale.  Each call
 * to `produceLabels` returns a fresh output object — no caching, no
 * shared references between frames.  Per-frame label/line accumulators
 * are locally-mutable for perf, but the returned arrays are typed
 * readonly so callers can't mutate them in place.
 */

import type { Label } from '../../../@types/rendering/Label';
import type { MarkerLine } from '../../../@types/rendering/MarkerLine';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { Vec4 } from '../../../@types/math/Vec4';
import type { LabelProducerOutput } from '../../../@types/engine/subsystems/LabelProducerOutput';
import type { PointOfInterest } from '../../../@types/engine/subsystems/PointOfInterest';
import type { PoiSubsystem } from '../../../@types/engine/subsystems/PoiSubsystem';
import { apparentSizePx } from '../../../utils/math/apparentSizePx';
import { FADE_IN_DURATION_MS } from '../../animation/fadeController';

type CategoryStyle = {
  readonly labelColor: Vec4;
  readonly lineColor: Vec4;
  /** Floor clamp on projected em height in screen pixels. */
  readonly minPixelSize: number;
  /** Ceiling clamp on projected em height in screen pixels. */
  readonly maxPixelSize: number;
  readonly worldEmMpc: number;
  readonly pixelWidth: number;
  /**
   * Smoothstep fade-band width in pixels above `minApparentSizePx`.
   * When set, POIs whose apparent size lands inside the band
   * `[minApparentSizePx, minApparentSizePx + fadeBandPx]` fade in via
   * smoothstep instead of popping.  Below the lower bound: still
   * skipped.  Above the upper bound: full alpha.  Undefined → binary
   * gate (the current behaviour).
   *
   * The pixel-offset lift + vertical marker-line, by contrast, is
   * driven per-POI via `PointOfInterest.labelAnchorOffsetMpc` rather
   * than per-category.  See that field's docstring for why the offset
   * is stored statically in world-space rather than computed each
   * frame from the camera distance.
   */
  readonly fadeBandPx?: number;
};

/**
 * The per-category visual style table.  Keys are the canonical
 * category identifiers; `PoiCategory` below is derived from these
 * keys so the type and the data cannot drift.
 *
 * Style choices:
 *   - cluster      — warm yellow, sub-Mpc world-em; min 14 px / max 60 px clamps
 *   - supercluster — slightly dimmer yellow, larger world-em (tens of Mpc extent);
 *                    min 14 px / max 60 px clamps
 *   - famousGalaxy — warm off-white, 0.005 Mpc world-em (set so M31 at ~0.78 Mpc
 *                    renders at roughly legible size); min 12 px / max 60 px clamps;
 *                    fadeBandPx: 4 smooths the apparent-size threshold.  Per-POI
 *                    `worldEmMpc` (set via `labelWorldEmMpc` from
 *                    `buildPoisFromFamousMeta`) overrides this default so larger
 *                    galaxies are naturally bigger labels.
 *   - void         — soft cyan, largest world-em (voids span 30–50+ Mpc radii);
 *                    min 14 px / max 60 px clamps
 */
export const POI_STYLES = {
  cluster: {
    labelColor: [1.0, 0.85, 0.4, 1] as Vec4,
    lineColor: [0.9, 0.75, 0.3, 1] as Vec4,
    minPixelSize: 35,
    maxPixelSize: 150,
    worldEmMpc: 1.25,
    pixelWidth: 2,
  },
  supercluster: {
    labelColor: [1.0, 0.8, 0.5, 1] as Vec4,
    lineColor: [0.9, 0.7, 0.45, 1] as Vec4,
    minPixelSize: 35,
    maxPixelSize: 150,
    worldEmMpc: 5.0,
    pixelWidth: 2,
  },
  famousGalaxy: {
    labelColor: [1.0, 0.95, 0.8, 1] as Vec4,
    lineColor: [0.9, 0.85, 0.7, 1] as Vec4,
    minPixelSize: 30,
    maxPixelSize: 150,
    worldEmMpc: 0.0125,
    pixelWidth: 2.5,
    fadeBandPx: 4,
  },
  void: {
    labelColor: [0.6, 0.85, 0.95, 1] as Vec4,
    lineColor: [0.45, 0.7, 0.85, 1] as Vec4,
    minPixelSize: 35,
    maxPixelSize: 150,
    worldEmMpc: 2.5,
    pixelWidth: 2,
  },
} as const satisfies Readonly<Record<string, CategoryStyle>>;

/**
 * The category union derived from POI_STYLES.  See the module header
 * for why the value and its type live together.
 */
export type PoiCategory = keyof typeof POI_STYLES;

const ALL_CATEGORIES_VISIBLE: Readonly<Record<PoiCategory, boolean>> = {
  cluster: true,
  supercluster: true,
  famousGalaxy: true,
  void: true,
};

export function createPoiSubsystem(): PoiSubsystem {
  // One-shot fade-in flag for the 'poi' label layer. Flips true on
  // the first frame that emits a non-empty label set.
  let didFireFadeIn = false;
  let pois: readonly PointOfInterest[] = [];
  let visibility: Readonly<Record<PoiCategory, boolean>> = ALL_CATEGORIES_VISIBLE;

  function setPois(next: readonly PointOfInterest[]): void {
    // Defensive copy — caller can mutate their array freely without
    // bleeding through to our internal state.
    pois = [...next];
  }

  function clearPois(): void {
    pois = [];
  }

  function setCategoryVisible(category: PoiCategory, visible: boolean): void {
    // Replace the record wholesale rather than mutating in place so
    // any holder of the previous reference sees a stable snapshot.
    visibility = { ...visibility, [category]: visible };
  }

  function makeCrosshairLines(p: PointOfInterest, style: CategoryStyle): readonly MarkerLine[] {
    if (p.crosshairSizeMpc === undefined) return [];
    const half = p.crosshairSizeMpc;
    const [cx, cy, cz] = p.worldPos;
    const mk = (id: string, from: Vec3, to: Vec3): MarkerLine => ({
      id,
      fromWorld: from,
      toWorld: to,
      pixelWidth: style.pixelWidth,
      // Fresh tuple per line — the renderer types these as mutable [n,n,n,n].
      color: [...style.lineColor],
    });
    return [
      mk(`${p.id}-x`, [cx - half, cy, cz], [cx + half, cy, cz]),
      mk(`${p.id}-y`, [cx, cy - half, cz], [cx, cy + half, cz]),
      mk(`${p.id}-z`, [cx, cy, cz - half], [cx, cy, cz + half]),
    ];
  }

  function produceLabels(state: EngineState, ctx: ReadyFrameContext): LabelProducerOutput {
    const labels: Label[] = [];
    const lines: MarkerLine[] = [];
    let awake = false;
    // Recover the vertical fov from the per-frame `drawPxPerRad`:
    //   drawPxPerRad = canvasSize.height / (2 * tan(fovY/2))
    // ⇒ fovY = 2 * atan(canvasSize.height / (2 * drawPxPerRad))
    // We do this rather than carrying fovY directly on ReadyFrameContext
    // because `drawPxPerRad` is the already-derived scalar every other
    // per-frame consumer reads from.
    const halfH = ctx.canvasSize.height * 0.5;
    const fovYRad = 2 * Math.atan(halfH / ctx.drawPxPerRad);
    const [cx, cy, cz] = ctx.drawCamPos;
    for (const p of pois) {
      if (!visibility[p.category]) continue;
      // Widen the `as const`-narrowed POI_STYLES entry back to the
      // declared shape so the optional `anchorOffsetPx` / `fadeBandPx`
      // fields are visible regardless of which category we're on.
      // Without this cast the literal-narrowed inferred type omits
      // any optional field that the specific category doesn't set.
      const style: CategoryStyle = POI_STYLES[p.category];

      // Camera distance to this POI — needed both for apparent-size
      // gating and for converting `anchorOffsetPx` to world space.
      // Computed once and reused.
      const dx = p.worldPos[0] - cx;
      const dy = p.worldPos[1] - cy;
      const dz = p.worldPos[2] - cz;
      const distanceMpc = Math.hypot(dx, dy, dz);

      // Apparent-size gate (binary skip below threshold, optional
      // smoothstep fade in the band above it).  Only runs when both
      // threshold AND diameter are set — see the type doc on
      // `apparentDiameterKpc` for the permissive-default rationale.
      let fadeAlpha = 1;
      if (p.minApparentSizePx !== undefined && p.apparentDiameterKpc !== undefined) {
        const sizePx = apparentSizePx({
          diameterKpc: p.apparentDiameterKpc,
          distanceMpc,
          viewportHeightPx: ctx.canvasSize.height,
          fovYRad,
        });
        if (sizePx < p.minApparentSizePx) continue;
        if (style.fadeBandPx !== undefined) {
          const t = Math.min(1, (sizePx - p.minApparentSizePx) / style.fadeBandPx);
          // smoothstep — same shape as youAreHereAlpha's transition.
          fadeAlpha = t * t * (3 - 2 * t);
          if (fadeAlpha > 0 && fadeAlpha < 1) awake = true;
        }
      }

      // Anchor-offset positioning + vertical marker line.  When the POI
      // sets `labelAnchorOffsetMpc`, the label is lifted by that amount
      // in +Y (world space) and a short vertical marker line runs from
      // the dot to 75% of the lift.  We deliberately use a STATIC
      // world-space offset (rather than a per-frame camera-distance
      // conversion of some pixel target) because the labelDirector's
      // signature optimisation excludes worldPos — a per-frame-derived
      // position would only get uploaded on the first frame the POI is
      // visible and then stay frozen at that camera distance.  See the
      // field docstring for the full rationale.
      let labelWorldPos: Vec3 = [p.worldPos[0], p.worldPos[1], p.worldPos[2]];
      let alignX: 'left' | 'center' | 'right' = 'left';
      if (p.labelAnchorOffsetMpc !== undefined) {
        const offset = p.labelAnchorOffsetMpc;
        labelWorldPos = [p.worldPos[0], p.worldPos[1] + offset, p.worldPos[2]];
        alignX = 'center';
        lines.push({
          id: `${p.id}-anchor`,
          fromWorld: [p.worldPos[0], p.worldPos[1], p.worldPos[2]],
          toWorld: [p.worldPos[0], p.worldPos[1] + offset * 0.75, p.worldPos[2]],
          pixelWidth: style.pixelWidth,
          color: [...style.lineColor],
          fadeAlpha,
        });
      }

      labels.push({
        id: p.id,
        worldPos: labelWorldPos,
        text: p.name,
        font: 'cormorant',
        pixelSize: 0, // legacy field — ignored by the new worldEm sizing model
        color: [...style.labelColor],
        worldEmMpc: p.labelWorldEmMpc ?? style.worldEmMpc,
        minPixelSize: style.minPixelSize,
        maxPixelSize: style.maxPixelSize,
        fadeAlpha,
        alignX,
      });
      for (const line of makeCrosshairLines(p, style)) lines.push(line);
    }
    // One-shot layer fade-in: first frame that emits a non-empty
    // label set fires fadeTo(1) on the POI layer's FadeHandle. See
    // youAreHereSubsystem for the symmetric pattern; the label
    // renderer doesn't consume the opacity yet (v1) — registration
    // is structural for future tour addressability.
    if (!didFireFadeIn && labels.length > 0) {
      didFireFadeIn = true;
      void state.subsystems.fades.fadeTo(
        { kind: 'labelLayer', layer: 'poi' },
        1,
        FADE_IN_DURATION_MS,
      );
    }
    return { labels, lines, awake };
  }

  // Built as a `const` (rather than returned inline) so we can attach
  // the `satisfies Destroyable` latch — the POI subsystem is one of
  // the engine's ~13 teardown targets, and the shared shape lets
  // engine.destroy() iterate uniformly across the bag.
  const subsystem: PoiSubsystem = {
    id: 'pois',
    produceLabels,
    setPois,
    clearPois,
    setCategoryVisible,
    destroy(): void {
      // Intentionally empty — see the type-level docstring for why.
    },
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
