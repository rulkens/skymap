/**
 * poiSubsystem — typed list of named points of interest (clusters,
 * superclusters, famous galaxies, voids) rendered as text labels +
 * optional ring/halo markers.
 *
 * ### Why one subsystem for four kinds?
 *
 * Clusters, superclusters, individual famous galaxies, and voids all
 * share the same surface: anchor a label at a world position, optionally
 * draw a visual marker for the centre.  The differences (label colour,
 * default pixel size, marker tint) are data — `category` + a per-category
 * default table — so four subsystems would just quadruplicate plumbing.
 *
 * ### Why `POI_STYLES` and `PoiCategory` live together
 *
 * `PoiCategory` is derived from the const registry via `keyof typeof
 * POI_STYLES` (the FONTS / FontId pattern), so the value and its type
 * union can't drift: adding a fifth category is one POI_STYLES row.
 *
 * ### Marker pass (clusters / superclusters / voids)
 *
 * Cluster, supercluster, and void POIs render through the separate
 * `clusterMarkerRenderer` as soft additive halos + screen-AA rings at
 * their `physicalRadiusMpc` (see `produceMarkers`).  POIs without a radius
 * get a label only.
 *
 * ### Anchor-offset labels
 *
 * Famous galaxies (and any future category whose POIs set
 * `labelAnchorOffsetMpc`) lift the label a fixed *world-space* distance
 * above the dot, connected by a short vertical marker line.  The offset is
 * static world-space, not a per-frame pixel target — see the field's
 * docstring for why.  Categories that never set the offset (cluster, SC,
 * void) anchor at the ring centre.
 *
 * ### Fade band
 *
 * `fadeBandPx` is an optional smoothstep ramp above `minApparentSizePx`:
 * below the threshold the POI is skipped, inside `[min, min + fadeBandPx]`
 * the label + line fade in via smoothstep, above it full alpha.
 *
 * ### Immutability
 *
 * `setGroup` / `setPois` store a defensive spread copy; the two visibility
 * setters replace their record wholesale.  Each `produceLabels` call
 * returns a fresh object (no caching); per-frame accumulators are locally
 * mutable for perf but the returned arrays are typed readonly.
 *
 * ### Why marker vs label visibility are separate axes
 *
 * Two independent records so hiding cluster labels leaves the ring/halo
 * marker intact (and vice versa); one shared record would make a checkbox
 * secretly do two things.  `markerVisibility[category]` gates the
 * ring + halo in `produceMarkers`; `labelVisibility[category]` gates the
 * text in `produceLabels`.  Each loop reads ONLY its own record; both seed
 * from `ALL_CATEGORIES_VISIBLE`.
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
import type { PoiGroupId } from '../../../@types/engine/subsystems/PoiGroupId';
import type { CreatePoiSubsystemInput } from '../../../@types/engine/subsystems/CreatePoiSubsystemInput';
import type { ClusterMarkerDescriptor } from '../../../@types/rendering/ClusterMarkerDescriptor';
import { apparentSizePx } from '../../../utils/math/apparentSizePx';
import { hexToGl } from '../../../utils/color/hexToGl';
import { FADE_IN_DURATION_MS } from '../../animation/fadeController';
import { getLabelStyleOverride } from '../labelStyleOverride';

type CategoryStyle = {
  readonly labelColor: Vec4;
  /**
   * Colour of the vertical anchor-line connecting a lifted label back to
   * its POI's true world position.  Consumed only when the POI sets
   * `labelAnchorOffsetMpc` (today: famous galaxies); omit it for
   * categories that never set that field, since edits would have no effect.
   */
  readonly lineColor?: Vec4;
  /** Floor clamp on projected em height in screen pixels. */
  readonly minPixelSize: number;
  /** Ceiling clamp on projected em height in screen pixels. */
  readonly maxPixelSize: number;
  readonly worldEmMpc: number;
  readonly pixelWidth: number;
  /**
   * Smoothstep fade-band width (px) above `minApparentSizePx`.  POIs whose
   * apparent size lands inside `[min, min + fadeBandPx]` fade in via
   * smoothstep instead of popping; below the band they're skipped, above
   * it full alpha.  Undefined → binary gate.
   */
  readonly fadeBandPx?: number;
  /**
   * RGBA halo tint for the marker pass.  Alpha is the AT-REST opacity —
   * per-frame fade multiplies into it.  `null` opts the category OUT of
   * halo rendering (voids stay quieter via a reduced alpha; see below).
   */
  readonly haloColor: Vec4 | null;
  /**
   * RGBA ring tint for the marker pass; same at-rest-alpha semantics as
   * haloColor.  Always present.  Final alpha is `ringColor[3] × fadeAlpha
   * × selectionBump`.
   */
  readonly ringColor: Vec4;
  /**
   * Apparent on-screen radius (px) above which the marker fades OUT — past
   * it the ring fills the viewport and obscures its own membership, so the
   * fade hands the view back.  Reuses the `fadeBandPx` smoothstep shape.
   */
  readonly markerMaxApparentRadiusPx: number;
  /** Smoothstep band width for the marker fade-out. */
  readonly markerMaxApparentFadeBandPx: number;
  /**
   * Apparent on-screen radius (px) below which the marker fades OUT —
   * symmetric counterpart to `markerMaxApparentRadiusPx`: at far zoom a
   * few-pixel ring stops being a legible anchor.  Below the floor: alpha
   * 0 (descriptor skipped); in `[min, min + markerMinApparentFadeBandPx]`:
   * smoothstep 0 → 1; above: full alpha.
   *
   * Famous galaxies don't use this gate (their own `minApparentSizePx` +
   * `fadeBandPx` govern visibility); the field is required for shape
   * uniformity, so set famousGalaxy to a never-trips sentinel (0 / 1).
   */
  readonly markerMinApparentRadiusPx: number;
  /** Smoothstep band width for the marker fade-out at the far side. */
  readonly markerMinApparentFadeBandPx: number;
  /** Drop-shadow outline (straight RGBA — renderer premultiplies). */
  readonly outlineColor: Vec4;
  /** Outline width as em-fraction. Capped at ~0.28 by atlas padding. */
  readonly outlineEmFrac: number;
};

/**
 * Per-category visual style table.  `PoiCategory` below is derived from
 * these keys so the type and the data can't drift.
 *
 * Style choices:
 *   - cluster      — warm yellow, ~1 Mpc world-em
 *   - supercluster — dimmer yellow, larger world-em (tens of Mpc)
 *   - famousGalaxy — warm off-white, sub-kpc world-em; fadeBandPx smooths
 *                    the apparent-size threshold.  Per-POI `worldEmMpc`
 *                    overrides this default so larger galaxies get bigger
 *                    labels.
 *   - void         — soft cyan, largest world-em (30–50+ Mpc radii)
 */
export const POI_STYLES = {
  cluster: {
    labelColor: hexToGl('#FFD966'),
    minPixelSize: 35,
    maxPixelSize: 150,
    worldEmMpc: 1.25,
    pixelWidth: 2,
    // Fill (halo + ring) is dimmer than labelColor on purpose: at
    // full-bright RGB the additive halo dominated the galaxy field.
    haloColor: hexToGl('#B39947'),
    ringColor: hexToGl('#B39947'),
    markerMaxApparentRadiusPx: 700,
    markerMaxApparentFadeBandPx: 400,
    // The bulk MCXC catalog projects to a median ~5 px ring at its
    // distances.  This floor keeps the field to the prominent clusters
    // (rings below ~5 px fade out, full alpha by 9 px) so the sky isn't
    // papered with sub-readable specks.  Featured anchors (Virgo, Coma)
    // have large radii and sit far above the floor.
    markerMinApparentRadiusPx: 5,
    markerMinApparentFadeBandPx: 4,
    outlineColor: [0, 0, 0, 0.1],
    outlineEmFrac: 0.16,
  },
  supercluster: {
    labelColor: hexToGl('#FFCC80'),
    minPixelSize: 35,
    maxPixelSize: 150,
    worldEmMpc: 5.0,
    pixelWidth: 2,
    // Same dim+saturate treatment as cluster, pushed toward orange to
    // distinguish from cluster yellow.  SC halos span ~50 Mpc, so the
    // larger footprint reads clearly even at lower RGB.
    haloColor: hexToGl('#996B3666'),
    ringColor: hexToGl('#996B3666'),
    markerMaxApparentRadiusPx: 700,
    markerMaxApparentFadeBandPx: 400,
    // Higher floor than clusters: SC rings span ~20–100 Mpc and wrap most
    // of the viewport at far zoom, so the larger structure earns a bigger
    // pixel budget before it's worth drawing.
    markerMinApparentRadiusPx: 28,
    markerMinApparentFadeBandPx: 20,
    outlineColor: [0, 0, 0, 0.1],
    outlineEmFrac: 0.16,
  },
  famousGalaxy: {
    labelColor: hexToGl('#FFF2CC'),
    lineColor: hexToGl('#E6D9B3'),
    minPixelSize: 30,
    maxPixelSize: 150,
    worldEmMpc: 0.0125,
    pixelWidth: 2.5,
    fadeBandPx: 4,
    // Famous galaxies don't get the halo/ring treatment — they have
    // curated thumbnails on close approach instead.  null tints mean
    // produceMarkers skips them entirely.
    haloColor: null,
    ringColor: hexToGl('#000000'),
    markerMaxApparentRadiusPx: 700,
    markerMaxApparentFadeBandPx: 400,
    // Famous galaxies skip produceMarkers and use their own per-POI gate
    // in produceLabels; these are never-trips sentinels.
    markerMinApparentRadiusPx: 0,
    markerMinApparentFadeBandPx: 1,
    outlineColor: [0, 0, 0, 0.1],
    outlineEmFrac: 0.16,
  },
  void: {
    labelColor: hexToGl('#99D9F2'),
    minPixelSize: 35,
    maxPixelSize: 150,
    worldEmMpc: 2.5,
    pixelWidth: 2,
    // Cyan tint.  Reduced at-rest alpha (~0.65) so voids read as 'subtle
    // presence' — a dim glow distinguishing them from clusters while
    // staying quieter than the opaque cluster halos.
    haloColor: hexToGl('#73B3D9A5'),
    ringColor: hexToGl('#73B3D9'),
    markerMaxApparentRadiusPx: 700,
    markerMaxApparentFadeBandPx: 400,
    // Largest anchors (~30–100+ Mpc); same higher floor as superclusters
    // to avoid sub-readable chrome at far zoom.
    markerMinApparentRadiusPx: 28,
    markerMinApparentFadeBandPx: 20,
    outlineColor: [0, 0, 0, 0.1],
    outlineEmFrac: 0.16,
  },
} as const satisfies Readonly<Record<string, CategoryStyle>>;

/**
 * The category union derived from POI_STYLES.  See the module header
 * for why the value and its type live together.
 */
export type PoiCategory = keyof typeof POI_STYLES;

/**
 * Alpha floor for significance weighting in `produceMarkers`.  Halo + ring
 * alpha lerps from `SIG_MIN_ALPHA × distanceFade` (significance 0) to the
 * full `distanceFade` (significance 1).  The floor keeps low-significance
 * bulk clusters dim but visible — "structure, not fog".  Featured anchors
 * omit significance (→ 1) and render unweighted.
 */
const SIG_MIN_ALPHA = 0.25;

/**
 * Alpha scale applied to every NON-selected marker's ring + halo while
 * some POI is selected (cluster focus mode). Dimming the rest of the
 * field lets the focused structure's ring read clearly against its
 * neighbours; the selected POI itself keeps its 1.5× bump. At rest
 * (nothing selected) the scale is 1 — markers render unchanged.
 */
const NON_SELECTED_MARKER_DIM = 0.25;

/**
 * Minimum screen-pixel gap between two featured labels before the
 * lower-prominence one is suppressed.  produceLabels gates labels on
 * `featured` (~25-30 anchors + famous galaxies), then greedily declutters:
 * two labels whose anchors land within this many pixels in BOTH x and y
 * collide.  Tuned to keep dense regions (Shapley) readable without
 * over-culling merely-close neighbours.
 */
const DECLUTTER_MARGIN_PX = 48;

const ALL_CATEGORIES_VISIBLE: Readonly<Record<PoiCategory, boolean>> = {
  cluster: true,
  supercluster: true,
  famousGalaxy: true,
  void: true,
};

/**
 * Stable iteration order for the three POI groups, so every reader
 * (`findPoi`, `getPoisForCategory`, `produceLabels`, `produceMarkers`)
 * sees the same order — which keeps the ring pick-path's `instance_index →
 * getPoisForCategory(cat)[poiIndex]` alignment intact.
 */
const GROUP_ORDER: readonly PoiGroupId[] = ['staticAnchors', 'famous', 'clusterBulk'];

export function createPoiSubsystem(_input: CreatePoiSubsystemInput = {}): PoiSubsystem {
  // One-shot fade-in flag for the 'poi' label layer. Flips true on
  // the first frame that emits a non-empty label set.
  let didFireFadeIn = false;

  // Each group owns its own slot; absent groups contribute nothing to the
  // merged list.  A Map keyed by PoiGroupId keeps the slot lifecycle
  // explicit and stops the three sources from clobbering each other.
  const groups = new Map<PoiGroupId, readonly PointOfInterest[]>();

  // Two independent visibility axes: `markerVisibility` gates the
  // ring + halo in `produceMarkers`, `labelVisibility` gates the text in
  // `produceLabels`.  Both default to all-on; the SettingsPanel flips one
  // without affecting the other.
  let markerVisibility: Readonly<Record<PoiCategory, boolean>> = ALL_CATEGORIES_VISIBLE;
  let labelVisibility: Readonly<Record<PoiCategory, boolean>> = ALL_CATEGORIES_VISIBLE;

  /**
   * Concatenate all groups in canonical order.  Not cached — POI lists are
   * small (~500 max) and the concat is cheap next to the per-POI math that
   * follows.  One helper keeps the iteration-order contract in one place.
   */
  function allPois(): readonly PointOfInterest[] {
    const out: PointOfInterest[] = [];
    for (const id of GROUP_ORDER) {
      const g = groups.get(id);
      if (g !== undefined) {
        for (const p of g) out.push(p);
      }
    }
    return out;
  }

  function setGroup(id: PoiGroupId, pois: readonly PointOfInterest[]): void {
    // Defensive copy so external mutation can't bleed in after the call.
    groups.set(id, [...pois]);
  }

  function clearGroup(id: PoiGroupId): void {
    groups.delete(id);
  }

  function setPois(next: readonly PointOfInterest[]): void {
    // "Replace everything" shim: the caller hands the complete merged list
    // as one unit, so place it all in 'staticAnchors' and clear the other
    // two groups.  Callers that manage groups individually use setGroup.
    groups.set('staticAnchors', [...next]);
    groups.delete('famous');
    groups.delete('clusterBulk');
  }

  function clearPois(): void {
    // Clear all groups — symmetric counterpart to setPois([]).
    groups.clear();
  }

  function setCategoryMarkerVisible(category: PoiCategory, visible: boolean): void {
    // Replace the record wholesale rather than mutating in place so
    // any holder of the previous reference sees a stable snapshot.
    // Only the marker pass (ring + halo descriptors) reads this axis.
    markerVisibility = { ...markerVisibility, [category]: visible };
  }

  function setCategoryLabelVisible(category: PoiCategory, visible: boolean): void {
    // Symmetric counterpart to `setCategoryMarkerVisible`.  Only the
    // label pass (`produceLabels`) reads this axis — the marker pass
    // is unaffected, so hiding cluster labels leaves their rings intact.
    labelVisibility = { ...labelVisibility, [category]: visible };
  }

  function findPoi(id: string): PointOfInterest | null {
    // O(n) walk; n ≤ ~500, invisible at the budget level.
    return allPois().find((p) => p.id === id) ?? null;
  }

  function getPoisForCategory(category: PoiCategory): readonly PointOfInterest[] {
    // O(n) filter over allPois(), so the result order matches
    // produceMarkers — the contract the ring pick-path's instance_index
    // relies on.
    return allPois().filter((p) => p.category === category);
  }

  function produceLabels(state: EngineState, ctx: ReadyFrameContext): LabelProducerOutput {
    // A candidate that survives the gates: the built label, its optional
    // anchor line, the on-screen PROMINENCE (declutter sort key), and the
    // projected screen position used for overlap rejection.  `onScreen` is
    // false for behind-camera / out-of-viewport candidates, which are
    // accepted unconditionally and never block anyone.
    //
    // `prominencePx` is the label's apparent on-screen size: the ring's
    // apparent radius for cluster / SC / void, the galaxy's apparent
    // diameter for a famous galaxy.  Decluttering by size (not a flat
    // significance) keeps the large structure under the camera while a
    // small distant label sweeping across during an orbit yields, instead
    // of culling-then-releasing the structure you're inspecting (flicker).
    type LabelCandidate = {
      readonly label: Label;
      readonly line: MarkerLine | null;
      readonly prominencePx: number;
      readonly screenX: number;
      readonly screenY: number;
      readonly onScreen: boolean;
    };
    const candidates: LabelCandidate[] = [];
    // Recover the vertical fov from the per-frame `drawPxPerRad`:
    //   drawPxPerRad = canvasSize.height / (2 * tan(fovY/2))
    // ⇒ fovY = 2 * atan(canvasSize.height / (2 * drawPxPerRad))
    // We do this rather than carrying fovY directly on ReadyFrameContext
    // because `drawPxPerRad` is the already-derived scalar every other
    // per-frame consumer reads from.
    const halfH = ctx.canvasSize.height * 0.5;
    const fovYRad = 2 * Math.atan(halfH / ctx.drawPxPerRad);
    const [cx, cy, cz] = ctx.drawCamPos;
    // Snapshot the live-tuning override once so it stays consistent as the
    // loop crosses many POIs.  See `labelStyleOverride.ts`.
    const override = getLabelStyleOverride();
    for (const p of allPois()) {
      // Label-axis gate (markers consult `markerVisibility` separately).
      if (!labelVisibility[p.category]) continue;
      // Featured gate: only the ~25-30 curated anchors + famous galaxies
      // earn text; the ~375 bulk clusters/SCs still render rings/halos via
      // produceMarkers, just no label.
      if (!p.featured) continue;
      // Anchor gate: a structure label needs its ring marker as a visual
      // anchor (a label without a ring reads as orphaned text).
      // famousGalaxy is exempt — its anchor is the galaxy point itself.
      if (p.category !== 'famousGalaxy' && !markerVisibility[p.category]) continue;
      // Widen the `as const`-narrowed entry to the declared shape so the
      // optional `lineColor` / `fadeBandPx` fields are visible regardless
      // of category.
      const style: CategoryStyle = POI_STYLES[p.category];

      // Camera distance — for apparent-size gating and the marker
      // close-approach / far-distance fades.  Computed once, reused.
      const dx = p.worldPos[0] - cx;
      const dy = p.worldPos[1] - cy;
      const dz = p.worldPos[2] - cz;
      const distanceMpc = Math.hypot(dx, dy, dz);

      // Apparent-size gate (binary skip below threshold, optional
      // smoothstep fade in the band above).  Only the famousGalaxy arm
      // gates on apparent size; structure arms never do.
      let fadeAlpha = 1;
      // On-screen prominence (px), the declutter sort key — galaxy
      // diameter or ring radius (set below).  Defaults to 0 so a label
      // setting neither sinks to lowest priority rather than beating real
      // ones.
      let prominencePx = 0;
      if (
        p.category === 'famousGalaxy' &&
        p.minApparentSizePx !== undefined &&
        p.apparentDiameterKpc !== undefined
      ) {
        const sizePx = apparentSizePx({
          diameterKpc: p.apparentDiameterKpc,
          distanceMpc,
          viewportHeightPx: ctx.canvasSize.height,
          fovYRad,
        });
        if (sizePx < p.minApparentSizePx) continue;
        prominencePx = sizePx;
        if (style.fadeBandPx !== undefined) {
          const t = Math.min(1, (sizePx - p.minApparentSizePx) / style.fadeBandPx);
          fadeAlpha = t * t * (3 - 2 * t); // smoothstep
          // No `awake` signal: fadeAlpha is a pure function of camera
          // distance, and camera motion already wakes the loop.  Setting
          // awake mid-band would pin the loop on whenever a POI is fading.
        }
      }

      // Marker close-approach fade-out applied to the LABEL too.  When the
      // ring has grown past markerMaxApparentRadiusPx (cluster fills the
      // viewport), the floating label is just chrome — fading it with the
      // ring hands the view back to the galaxies.  Mirrors the smoothstep
      // produceMarkers uses below so label + ring disappear together;
      // skips the whole label when fully faded.
      //
      // Uses the apparent (wider) radius, which drives the ring's on-screen
      // size.  Only structure arms have a radius; famous galaxies skip this
      // (their per-POI minApparentSizePx gate handles the far end).
      const markerRadiusMpc =
        p.category === 'famousGalaxy' ? undefined : (p.apparentRadiusMpc ?? p.physicalRadiusMpc);
      if (markerRadiusMpc !== undefined && distanceMpc > 0.001) {
        const apRadPx = (markerRadiusMpc / distanceMpc) * (halfH / Math.tan(fovYRad * 0.5));
        prominencePx = apRadPx;
        if (apRadPx > style.markerMaxApparentRadiusPx) {
          const t = Math.min(
            1,
            (apRadPx - style.markerMaxApparentRadiusPx) / style.markerMaxApparentFadeBandPx,
          );
          const markerFadeOut = 1 - t * t * (3 - 2 * t);
          if (markerFadeOut <= 0) continue;
          // No `awake` signal — same reason as the fade-in band above.
          fadeAlpha = Math.min(fadeAlpha, markerFadeOut);
        }
        // Far-distance fade-out — mirrors produceMarkers' min-radius branch
        // so label and ring disappear together at far zoom (without this
        // the label would linger at full alpha after the ring fades).
        if (apRadPx < style.markerMinApparentRadiusPx + style.markerMinApparentFadeBandPx) {
          let minFadeOut: number;
          if (apRadPx < style.markerMinApparentRadiusPx) {
            minFadeOut = 0;
          } else {
            const t =
              (apRadPx - style.markerMinApparentRadiusPx) / style.markerMinApparentFadeBandPx;
            minFadeOut = t * t * (3 - 2 * t);
          }
          if (minFadeOut <= 0) continue;
          fadeAlpha = Math.min(fadeAlpha, minFadeOut);
        }
      }

      // Anchor-offset positioning + vertical marker line.  When the POI
      // sets `labelAnchorOffsetMpc`, the label lifts by that amount in +Y
      // (world space) with a short line from the dot to 75% of the lift.
      // The offset is STATIC world-space, not a per-frame camera-distance
      // conversion, because the labelDirector's signature optimisation
      // excludes worldPos — a per-frame-derived position would freeze at
      // the first-visible camera distance.  See the field docstring.
      let labelWorldPos: Vec3 = [p.worldPos[0], p.worldPos[1], p.worldPos[2]];
      // Labels without a lift (clusters / SCs / voids) anchor at the ring
      // centre, centred on both axes.  Famous galaxies override below.
      let alignX: 'left' | 'center' | 'right' = 'center';
      let alignY: 'baseline' | 'center' | 'top' | 'bottom' = 'center';
      // Collected per-candidate so the declutter pass can drop a label
      // together with its anchor line when it loses an overlap.
      let candidateLine: MarkerLine | null = null;
      if (p.category === 'famousGalaxy' && p.labelAnchorOffsetMpc !== undefined) {
        const offset = p.labelAnchorOffsetMpc;
        labelWorldPos = [p.worldPos[0], p.worldPos[1] + offset, p.worldPos[2]];
        alignX = 'center';
        alignY = 'baseline';
        // lineColor is optional — if a category uses the offset-label idiom
        // without declaring one, skip the connecting line (the label still
        // renders at the lifted position, just without the anchor).
        if (style.lineColor !== undefined) {
          candidateLine = {
            id: `${p.id}-anchor`,
            fromWorld: [p.worldPos[0], p.worldPos[1], p.worldPos[2]],
            toWorld: [p.worldPos[0], p.worldPos[1] + offset * 0.75, p.worldPos[2]],
            pixelWidth: style.pixelWidth,
            color: [...style.lineColor],
            fadeAlpha,
          };
        }
      }

      // Per-POI override fields: only POIs whose own category matches
      // the override's target adopt the outline values; other
      // categories keep their category-default outline.
      const overrideFields =
        override.targetCategory === p.category
          ? {
              outlineColor: override.outlineColor,
              outlineEmFrac: override.outlineEmFrac,
            }
          : {};

      const label: Label = {
        id: p.id,
        worldPos: labelWorldPos,
        text: p.name,
        font: 'cormorant',
        pixelSize: 0, // unused — superseded by the worldEm sizing model
        color: [...style.labelColor],
        worldEmMpc:
          (p.category === 'famousGalaxy' ? p.labelWorldEmMpc : undefined) ?? style.worldEmMpc,
        minPixelSize: style.minPixelSize,
        maxPixelSize: style.maxPixelSize,
        fadeAlpha,
        alignX,
        alignY,
        outlineColor: [...style.outlineColor],
        outlineEmFrac: style.outlineEmFrac,
        ...overrideFields,
      };

      // Project the label's lifted world position to screen pixels for the
      // declutter overlap test.  Column-major mat4·vec4 by hand — the lib's
      // vec4.transformMat4 allocates per call.
      const m = ctx.vp;
      const wx = labelWorldPos[0];
      const wy = labelWorldPos[1];
      const wz = labelWorldPos[2];
      const clipX = m[0] * wx + m[4] * wy + m[8] * wz + m[12];
      const clipY = m[1] * wx + m[5] * wy + m[9] * wz + m[13];
      const clipW = m[3] * wx + m[7] * wy + m[11] * wz + m[15];
      // Behind-camera (clipW <= 0): the label is off-screen.  Accept it
      // as-is (the label renderer clips offscreen labels) and exclude it
      // from overlap tests so it neither blocks nor is blocked.
      let screenX = 0;
      let screenY = 0;
      let onScreen = false;
      if (clipW > 0) {
        const ndcX = clipX / clipW;
        const ndcY = clipY / clipW;
        screenX = (ndcX * 0.5 + 0.5) * ctx.canvasSize.width;
        // Flip Y: NDC +Y is up, screen +Y is down.
        screenY = (1 - (ndcY * 0.5 + 0.5)) * ctx.canvasSize.height;
        // Only candidates inside (a slightly padded) viewport participate
        // in overlap rejection; ones projecting outside can't visually
        // collide with on-screen labels.
        onScreen = ndcX >= -1 && ndcX <= 1 && ndcY >= -1 && ndcY <= 1;
      }

      candidates.push({
        label,
        line: candidateLine,
        prominencePx,
        screenX,
        screenY,
        onScreen,
      });
    }

    // Screen-space declutter.  The featured set is tiny (≤~30), so an
    // O(n²) greedy beats a spatial structure.  Sort by prominence DESC
    // (index tiebreaker keeps ties in input order); accept a candidate when
    // its anchor sits ≥ DECLUTTER_MARGIN_PX (in x OR y) from every accepted
    // ON-SCREEN anchor.  Off-screen candidates are accepted unconditionally
    // and never block.
    const order = candidates.map((_, i) => i);
    order.sort((a, b) => {
      const d = candidates[b]!.prominencePx - candidates[a]!.prominencePx;
      return d !== 0 ? d : a - b;
    });
    const accepted: LabelCandidate[] = [];
    for (const i of order) {
      const c = candidates[i]!;
      if (c.onScreen) {
        let collides = false;
        for (const a of accepted) {
          if (!a.onScreen) continue;
          if (
            Math.abs(c.screenX - a.screenX) < DECLUTTER_MARGIN_PX &&
            Math.abs(c.screenY - a.screenY) < DECLUTTER_MARGIN_PX
          ) {
            collides = true;
            break;
          }
        }
        if (collides) continue;
      }
      accepted.push(c);
    }

    // Emit accepted candidates in original input order so the output is
    // deterministic and independent of the prominence sort.
    const acceptedSet = new Set(accepted);
    const labels: Label[] = [];
    const lines: MarkerLine[] = [];
    for (const c of candidates) {
      if (!acceptedSet.has(c)) continue;
      labels.push(c.label);
      if (c.line !== null) lines.push(c.line);
    }

    // One-shot layer fade-in: the first non-empty label set fires
    // fadeTo(1) on the POI layer's FadeHandle (symmetric with
    // youAreHereSubsystem).  The label renderer doesn't consume the
    // opacity yet — registration is structural for future tour addressing.
    if (!didFireFadeIn && labels.length > 0) {
      didFireFadeIn = true;
      void state.subsystems.fades.fadeTo(
        { kind: 'labelLayer', layer: 'poi' },
        1,
        FADE_IN_DURATION_MS,
      );
    }
    return { labels, lines, awake: false };
  }

  function produceMarkers(
    state: EngineState,
    ctx: ReadyFrameContext,
  ): readonly ClusterMarkerDescriptor[] {
    const out: ClusterMarkerDescriptor[] = [];
    const halfH = ctx.canvasSize.height * 0.5;
    const fovYRad = 2 * Math.atan(halfH / ctx.drawPxPerRad);
    const pxPerRad = (ctx.canvasSize.height * 0.5) / Math.tan(fovYRad * 0.5);
    const [cx, cy, cz] = ctx.drawCamPos;
    // Two POI ids drive two distinct marker effects, mirroring the
    // galaxy side so POIs and galaxies behave identically:
    //   - selected  → the 1.5× ring bump (highlight what you clicked),
    //     the analogue of the galaxy selection halo (selectionRingPass
    //     also reads selected()).
    //   - focused   → the "every OTHER ring recedes" dim, the marker
    //     half of cluster-focus mode — same trigger as the galaxy/disk
    //     member-isolation fade (runFrame reads focused()).
    // Reading both off the subsystem keeps produceMarkers a pure
    // function of state.  Galaxy selections/focuses leave the matching
    // id null → no ring is bumped / nothing dims.
    const sel = state.subsystems.selection.selected();
    const selectedPoiId = sel !== null && sel.kind === 'poi' ? sel.id : null;
    const foc = state.subsystems.selection.focused();
    const focusedPoiId = foc !== null && foc.kind === 'poi' ? foc.id : null;

    // Emit-all-then-discard contract.  Every marker-bearing POI of a
    // VISIBLE category emits EXACTLY ONE descriptor, in allPois() order —
    // including fully-faded ones (alpha-0 colours the fragments discard).
    // This keeps each category's run index-aligned with
    // `getPoisForCategory(category)`: the ring pick path packs
    // `@builtin(instance_index)` as the per-category-local POI index, and
    // `resolvePoiFromPick` resolves it through `getPoisForCategory(cat)
    // [poiIndex]`.  Omitting a faded POI would index-shift that lookup.
    // The only legitimate `continue`s are all-or-nothing-per-category
    // (visibility) or the non-marker famousGalaxy — neither perturbs
    // within-category alignment.
    for (const p of allPois()) {
      // Marker-axis gate only (independent of labelVisibility).  A hidden
      // category draws nothing, so this all-or-nothing skip is safe.
      if (!markerVisibility[p.category]) continue;
      // Famous galaxies opt out (no radius; picked via the point path, not
      // the ring path), so this skip doesn't perturb structure alignment.
      // Skipping early also narrows `p` to the structure arms.
      if (p.category === 'famousGalaxy') continue;
      // Render at the WIDER apparent extent, falling back to the core for
      // structures that only set physicalRadiusMpc.
      const radiusMpc = p.apparentRadiusMpc ?? p.physicalRadiusMpc;
      const style: CategoryStyle = POI_STYLES[p.category];

      const dx = p.worldPos[0] - cx;
      const dy = p.worldPos[1] - cy;
      const dz = p.worldPos[2] - cz;
      const distanceMpc = Math.hypot(dx, dy, dz);

      // Camera on top of the POI: the projection divides by distance, so
      // treat the marker as fully faded (alpha 0).  Still emit a descriptor
      // (not `continue`) to keep the instance_index alignment — discarded
      // in-fragment.
      let fadeAlpha: number;
      if (distanceMpc < 0.001) {
        fadeAlpha = 0;
      } else {
        // Apparent on-screen radius in pixels.
        const apparentRadiusPx = (radiusMpc / distanceMpc) * pxPerRad;

        // Max-apparent-radius fade-out: smoothstep 1 → 0 as the projected
        // ring grows past markerMaxApparentRadiusPx.  Above the band:
        // alpha 0 (invisible, not omitted).
        let maxFadeAlpha = 1;
        if (apparentRadiusPx > style.markerMaxApparentRadiusPx) {
          const t = Math.min(
            1,
            (apparentRadiusPx - style.markerMaxApparentRadiusPx) /
              style.markerMaxApparentFadeBandPx,
          );
          // Smoothstep, then invert so we fade 1 → 0.
          maxFadeAlpha = 1 - t * t * (3 - 2 * t);
        }

        // Far-distance fade-out: symmetric counterpart to maxFadeAlpha.
        // Below markerMinApparentRadiusPx the ring stops being a legible
        // anchor; smoothstep 0 → 1 across the band so rings don't pop as
        // the camera pulls back.  No `awake` signal (camera motion wakes
        // the loop), same as the max-radius fade.
        let minFadeAlpha: number;
        if (apparentRadiusPx < style.markerMinApparentRadiusPx) {
          minFadeAlpha = 0;
        } else if (
          apparentRadiusPx <
          style.markerMinApparentRadiusPx + style.markerMinApparentFadeBandPx
        ) {
          const t =
            (apparentRadiusPx - style.markerMinApparentRadiusPx) /
            style.markerMinApparentFadeBandPx;
          minFadeAlpha = t * t * (3 - 2 * t);
        } else {
          minFadeAlpha = 1;
        }

        // Fully faded (either end) → alpha-0 descriptor, not an omission
        // (see the loop header's pick-index alignment contract).
        fadeAlpha = Math.min(maxFadeAlpha, minFadeAlpha);
      }

      // Significance weighting on top of the distance fade: lerp from
      // SIG_MIN_ALPHA (significance 0) to 1 (significance 1), keeping
      // low-significance structures dim-but-visible.  Featured anchors omit
      // `significance`, so `?? 1` leaves their at-rest alpha unchanged.
      const sigWeight = SIG_MIN_ALPHA + (1 - SIG_MIN_ALPHA) * (p.significance ?? 1);
      const weightedFade = fadeAlpha * sigWeight;

      // Cluster focus mode: while some POI is FOCUSED, every OTHER marker
      // dims to NON_SELECTED_MARKER_DIM, in lockstep with the galaxy/disk
      // member fade.  A bare select (single-click) does NOT dim — only a
      // focus (double-click) does.  At rest dim is 1.
      const isSelected = p.id === selectedPoiId;
      const dim = focusedPoiId !== null && p.id !== focusedPoiId ? NON_SELECTED_MARKER_DIM : 1;

      // Halo: bake style at-rest alpha × per-frame fade × focus dim into
      // the alpha channel.  Voids opt out via null haloColor → [0,0,0,0]
      // (the renderer skips alpha==0 instances).
      const haloColor: Vec4 =
        style.haloColor !== null
          ? [
              style.haloColor[0],
              style.haloColor[1],
              style.haloColor[2],
              style.haloColor[3] * weightedFade * dim,
            ]
          : [0, 0, 0, 0];

      // Ring: same fade bake as halo, plus selection.  The selected ring's
      // alpha is ×1.5 (capped at 1.0) so it pops; every other ring is
      // scaled by the focus dim.  Fresh tuple, not mutated in place, to
      // keep the descriptor immutable.
      const ringAlphaBase = style.ringColor[3] * weightedFade;
      const ringAlpha = isSelected ? Math.min(1, ringAlphaBase * 1.5) : ringAlphaBase * dim;
      const ringColor: Vec4 = [
        style.ringColor[0],
        style.ringColor[1],
        style.ringColor[2],
        ringAlpha,
      ];

      out.push({
        id: p.id,
        category: p.category,
        worldPos: [p.worldPos[0], p.worldPos[1], p.worldPos[2]],
        radiusMpc,
        haloColor,
        ringColor,
      });
    }
    return out;
  }

  // Bound to a `const` so the `satisfies Destroyable` latch below can
  // attach — the shared shape lets engine.destroy() iterate the bag.
  const subsystem: PoiSubsystem = {
    id: 'pois',
    produceLabels,
    produceMarkers,
    setGroup,
    clearGroup,
    setPois,
    clearPois,
    setCategoryMarkerVisible,
    setCategoryLabelVisible,
    findPoi,
    getPoisForCategory,
    destroy(): void {
      // Intentionally empty — the subsystem owns only plain-data state
      // (group map, visibility records); no listeners, timers, or workers
      // to release.  Method exists so engine.destroy() can iterate its
      // subsystem bag uniformly.
    },
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
