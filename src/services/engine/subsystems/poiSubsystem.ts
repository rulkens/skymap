/**
 * poiSubsystem — typed list of named points of interest (clusters,
 * galaxies, voids) rendered as text labels + optional crosshairs.
 *
 * ### Why one subsystem for three kinds?
 *
 * Clusters, individual famous galaxies, and voids all share the same
 * physical surface: anchor a label at a world position, optionally draw
 * a small visual marker so the user can see the precise centre.  The
 * differences (label colour, default pixel size, crosshair size) are
 * data — `category` + a per-category default table.  Splitting into
 * three subsystems would triplicate the producer plumbing without
 * adding any clarity.
 *
 * ### Crosshair shape
 *
 * Three perpendicular line segments, each `crosshairSizeMpc` long,
 * centred on `worldPos`.  Cheap to render (3 lines per POI), reads
 * clearly at any zoom, and indicates the precise centre regardless
 * of the label's text bounds.  POIs without `crosshairSizeMpc` (e.g.
 * individual galaxies the user clicked on once) get a label only.
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
import type { ReadyFrameContext } from '../frame/frameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { Vec4 } from '../../../@types/math/Vec4';
import type { LabelProducer, LabelProducerOutput } from './labelProducer';

export type PoiCategory = 'cluster' | 'galaxy' | 'void';

export type PointOfInterest = {
  readonly id: string;
  readonly name: string;
  readonly category: PoiCategory;
  readonly worldPos: Vec3;
  /** Crosshair half-length in Mpc.  Omit to draw label only. */
  readonly crosshairSizeMpc?: number;
};

export type PoiSubsystem = LabelProducer & {
  setPois(pois: readonly PointOfInterest[]): void;
  clearPois(): void;
  setCategoryVisible(category: PoiCategory, visible: boolean): void;
  /**
   * Tear down the subsystem.  No-op — the subsystem owns only
   * plain-data state (pois list, visibility record); there are no
   * listeners, timers, or workers to release.  Method exists so the
   * engine's bag of subsystems can be torn down uniformly via the
   * shared `Destroyable` shape (`engine.destroy()` iterates and calls
   * `destroy()` on each).
   */
  destroy(): void;
};

type CategoryStyle = {
  readonly labelColor: Vec4;
  readonly lineColor: Vec4;
  readonly pixelSize: number;
  readonly worldEmMpc: number;
  readonly pixelWidth: number;
};

const STYLES: Readonly<Record<PoiCategory, CategoryStyle>> = {
  cluster: {
    labelColor: [1.0, 0.85, 0.4, 1], // warm yellow — clusters
    lineColor: [0.9, 0.75, 0.3, 1],
    pixelSize: 16,
    worldEmMpc: 0.5, // legible at tens-of-Mpc zoom
    pixelWidth: 2,
  },
  galaxy: {
    labelColor: [0.85, 0.9, 1.0, 1], // cool white — individual galaxies
    lineColor: [0.7, 0.75, 0.85, 1],
    pixelSize: 14,
    worldEmMpc: 0.02, // legible at sub-Mpc zoom
    pixelWidth: 1.5,
  },
  void: {
    labelColor: [0.6, 0.85, 0.95, 1], // soft cyan — voids
    lineColor: [0.45, 0.7, 0.85, 1],
    pixelSize: 16,
    worldEmMpc: 1.0,
    pixelWidth: 2,
  },
};

const ALL_CATEGORIES_VISIBLE: Readonly<Record<PoiCategory, boolean>> = {
  cluster: true,
  galaxy: true,
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
    const mk = (
      id: string,
      from: Vec3,
      to: Vec3,
    ): MarkerLine => ({
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

  function produceLabels(_state: EngineState, _ctx: ReadyFrameContext): LabelProducerOutput {
    const labels: Label[] = [];
    const lines: MarkerLine[] = [];
    for (const p of pois) {
      if (!visibility[p.category]) continue;
      const style = STYLES[p.category];
      labels.push({
        id: p.id,
        worldPos: [p.worldPos[0], p.worldPos[1], p.worldPos[2]],
        text: p.name,
        pixelSize: style.pixelSize,
        color: [...style.labelColor],
        worldEmMpc: style.worldEmMpc,
        fadeAlpha: 1,
        alignX: 'left',
      });
      for (const line of makeCrosshairLines(p, style)) lines.push(line);
    }
    // POIs are static unless setPois is called — the director never needs
    // a continuation render frame on our behalf.
    return { labels, lines, awake: false };
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
