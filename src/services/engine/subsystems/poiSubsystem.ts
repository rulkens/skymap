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

type CategoryStyle = {
  readonly labelColor: Vec4;
  readonly lineColor: Vec4;
  readonly pixelSize: number;
  readonly worldEmMpc: number;
  readonly pixelWidth: number;
  /**
   * Pixel-space vertical lift above the POI's worldPos.  When set, the
   * label sits this many pixels above the dot, a vertical marker line
   * is drawn from the dot to 75% of the lift, and the label uses
   * `alignX: 'center'`.  Undefined → label anchored at the dot, no
   * marker line, `alignX: 'left'` (the cluster/supercluster/void
   * default).  The pixel value is converted to world space per-frame
   * using `(offsetPx / drawPxPerRad) * distanceMpc`.
   */
  readonly anchorOffsetPx?: number;
  /**
   * Smoothstep fade-band width in pixels above `minApparentSizePx`.
   * When set, POIs whose apparent size lands inside the band
   * `[minApparentSizePx, minApparentSizePx + fadeBandPx]` fade in via
   * smoothstep instead of popping.  Below the lower bound: still
   * skipped.  Above the upper bound: full alpha.  Undefined → binary
   * gate (the current behaviour).
   */
  readonly fadeBandPx?: number;
};

/**
 * The per-category visual style table.  Keys are the canonical
 * category identifiers; `PoiCategory` below is derived from these
 * keys so the type and the data cannot drift.
 *
 * Style choices:
 *   - cluster      — warm yellow, mid pixel size, sub-Mpc world-em
 *   - supercluster — slightly dimmer yellow, larger world-em (tens of Mpc extent)
 *   - famousGalaxy — warm off-white, 18 px / 0.005 worldEmMpc (pixel-dominant,
 *                    barely scales with distance — matches the "You are here"
 *                    pin); anchorOffsetPx: 20 lifts the label above the dot;
 *                    fadeBandPx: 4 smooths the apparent-size threshold.
 *   - void         — soft cyan, largest world-em (voids span 30–50+ Mpc radii)
 */
export const POI_STYLES = {
  cluster: {
    labelColor: [1.0, 0.85, 0.4, 1] as Vec4,
    lineColor: [0.9, 0.75, 0.3, 1] as Vec4,
    pixelSize: 16,
    worldEmMpc: 0.5,
    pixelWidth: 2,
  },
  supercluster: {
    labelColor: [1.0, 0.8, 0.5, 1] as Vec4,
    lineColor: [0.9, 0.7, 0.45, 1] as Vec4,
    pixelSize: 16,
    worldEmMpc: 2.0,
    pixelWidth: 2,
  },
  famousGalaxy: {
    labelColor: [1.0, 0.95, 0.8, 1] as Vec4,
    lineColor: [0.9, 0.85, 0.7, 1] as Vec4,
    pixelSize: 18,
    worldEmMpc: 0.005,
    pixelWidth: 1.5,
    anchorOffsetPx: 20,
    fadeBandPx: 4,
  },
  void: {
    labelColor: [0.6, 0.85, 0.95, 1] as Vec4,
    lineColor: [0.45, 0.7, 0.85, 1] as Vec4,
    pixelSize: 16,
    worldEmMpc: 1.0,
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

  function produceLabels(_state: EngineState, ctx: ReadyFrameContext): LabelProducerOutput {
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
    const pxPerRad = ctx.drawPxPerRad;
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

      // Anchor-offset positioning + vertical marker line.  When
      // `anchorOffsetPx` is set, the label sits N pixels above the dot
      // (in world space, scaled by distance), and a vertical line runs
      // from the dot to 75% of the offset.
      let labelWorldPos: Vec3 = [p.worldPos[0], p.worldPos[1], p.worldPos[2]];
      let alignX: 'left' | 'center' | 'right' = 'left';
      if (style.anchorOffsetPx !== undefined) {
        const offsetWorld = (style.anchorOffsetPx / pxPerRad) * distanceMpc;
        labelWorldPos = [p.worldPos[0], p.worldPos[1] + offsetWorld, p.worldPos[2]];
        alignX = 'center';
        lines.push({
          id: `${p.id}-anchor`,
          fromWorld: [p.worldPos[0], p.worldPos[1], p.worldPos[2]],
          toWorld: [p.worldPos[0], p.worldPos[1] + offsetWorld * 0.75, p.worldPos[2]],
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
        pixelSize: style.pixelSize,
        color: [...style.labelColor],
        worldEmMpc: style.worldEmMpc,
        fadeAlpha,
        alignX,
      });
      for (const line of makeCrosshairLines(p, style)) lines.push(line);
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
