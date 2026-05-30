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
 * ### Marker pass (clusters / superclusters / voids)
 *
 * Cluster, supercluster, and void POIs now render through the
 * separate `clusterMarkerRenderer` as soft additive halos + screen-AA
 * rings at their `physicalRadiusMpc` — see `produceMarkers` below.
 * The previous three-perpendicular-line crosshair gizmo was removed
 * in 2026-05-18 (cluster-viz plan 2/4); see the spec
 * `docs/superpowers/specs/2026-05-18-cluster-supercluster-viz-design.md`
 * §2 for the rationale.  POIs without `physicalRadiusMpc` get a
 * label only.
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
 * spread so external mutation can't bleed in.  The two visibility
 * setters (`setCategoryMarkerVisible` and `setCategoryLabelVisible`)
 * each replace their per-category visibility record wholesale.  Each
 * call to `produceLabels` returns a fresh output object — no caching,
 * no shared references between frames.  Per-frame label/line
 * accumulators are locally-mutable for perf, but the returned arrays
 * are typed readonly so callers can't mutate them in place.
 *
 * ### Why marker vs label visibility are separate axes
 *
 * Prior to the 2026-05-19 settings-panel audit (Q11) a single
 * `visibility` record was consulted by BOTH `produceLabels` and
 * `produceMarkers`.  That conflation meant a UI toggle labelled "show
 * cluster labels" secretly also suppressed the cluster ring/halo
 * marker — the kind of "the checkbox does two things" bug the audit
 * was looking for.  The fix splits the record into two independent
 * axes:
 *
 *   - `markerVisibility[category]` — gates the cluster/SC/void ring +
 *     halo (the visible dot/glyph) drawn by `produceMarkers`.
 *   - `labelVisibility[category]`  — gates the text label drawn by
 *     `produceLabels`.
 *
 * Each loop now reads ONLY its own record.  The two are seeded from
 * the same `ALL_CATEGORIES_VISIBLE` default so day-one behaviour is
 * unchanged (everything visible); the SettingsPanel restructure
 * (Task #6 of the audit) wires them to different master toggles.
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
import type { CreatePoiSubsystemInput } from '../../../@types/engine/subsystems/CreatePoiSubsystemInput';
import type { ClusterMarkerDescriptor } from '../../../@types/rendering/ClusterMarkerDescriptor';
import { apparentSizePx } from '../../../utils/math/apparentSizePx';
import { hexToGl } from '../../../utils/color/hexToGl';
import { FADE_IN_DURATION_MS } from '../../animation/fadeController';
import { getLabelStyleOverride } from '../labelStyleOverride';

type CategoryStyle = {
  readonly labelColor: Vec4;
  /**
   * Colour of the vertical anchor-line that connects a lifted label
   * back to its POI's true world position.  Only consumed when the POI
   * sets `labelAnchorOffsetMpc` (today: famous galaxies).  Categories
   * whose POIs never set that field (cluster, supercluster, void)
   * should omit `lineColor` entirely — leaving a stale value here is a
   * footgun, since edits to it have no visible effect.
   */
  readonly lineColor?: Vec4;
  /** Floor clamp on projected em height in screen pixels. */
  readonly minPixelSize: number;
  /** Ceiling clamp on projected em height in screen pixels. */
  readonly maxPixelSize: number;
  readonly worldEmMpc: number;
  readonly pixelWidth: number;
  /**
   * Smoothstep fade-band width in pixels above `minApparentSizePx`.
   * (Unchanged from the pre-cluster-viz revision; see the existing
   *  docblock — kept verbatim above this comment block.)
   *
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
  /**
   * RGBA halo tint for the marker pass.  Alpha is the AT-REST opacity
   * — the per-frame fade math multiplies into it, so a style alpha of
   * 0.5 means "halo never exceeds 50% even before fade".  `null` opts
   * the category OUT of halo rendering — voids are 'absence', not
   * 'presence'; emitting an additive glow there would contradict the
   * spec's semantics.  Cluster + supercluster use the same warm tint
   * family as labelColor.
   */
  readonly haloColor: Vec4 | null;
  /**
   * RGBA ring tint for the marker pass.  Same at-rest-alpha semantics
   * as haloColor.  Always present — every marker-bearing category gets
   * a visible ring at its apparent radius.  Mirrors labelColor.rgb;
   * the final alpha the renderer sees is `ringColor[3] × fadeAlpha ×
   * selectionBump`.
   */
  readonly ringColor: Vec4;
  /**
   * Apparent on-screen radius (pixels) above which the marker fades
   * OUT.  Above this threshold the ring is so big it fills the viewport
   * and obscures the galaxies it's meant to contain; the fade hands
   * the view back to the surrounding membership.  Reuses the smoothstep
   * shape of the existing `fadeBandPx` fade-IN ramp for symmetry.
   */
  readonly markerMaxApparentRadiusPx: number;
  /** Smoothstep band width for the marker fade-out. */
  readonly markerMaxApparentFadeBandPx: number;
  /**
   * Apparent on-screen radius (pixels) below which the marker fades
   * OUT.  Symmetric counterpart to `markerMaxApparentRadiusPx`: when
   * the projected ring shrinks to a handful of pixels at far zoom the
   * ring stops being a legible anchor and starts cluttering the view
   * with sub-readable rings + floating labels.  Below this floor:
   * alpha 0 (descriptor skipped).  In the band `[min, min +
   * markerMinApparentFadeBandPx]`: smoothstep ramp from 0 → 1.  Above
   * the band: full alpha (subject to the close-approach fade-out).
   *
   * Famous galaxies don't use this gate — their visibility is governed
   * by the per-POI `minApparentSizePx` + `fadeBandPx` measured against
   * the galaxy's own `apparentDiameterKpc`.  The field is still
   * required on this type for shape uniformity; set famousGalaxy to a
   * sentinel that never trips (e.g. 0 / 1).
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
    labelColor: hexToGl('#FFD966'),
    minPixelSize: 35,
    maxPixelSize: 150,
    worldEmMpc: 1.25,
    pixelWidth: 2,
    // Fill colour (additive halo + ring tint) is dimmer than the
    // labelColor on purpose: at full-bright RGB the halo dominated the
    // background galaxy field.  Max channel pulled to ~0.7 so clusters
    // read as warm yellow accents rather than spotlights.
    haloColor: hexToGl('#B39947'),
    ringColor: hexToGl('#B39947'),
    markerMaxApparentRadiusPx: 700,
    markerMaxApparentFadeBandPx: 400,
    // Clusters span ~1–5 Mpc cores; at far zoom they're the first
    // category to drop from legibility, so the floor sits higher than
    // for superclusters / voids.
    markerMinApparentRadiusPx: 12,
    markerMinApparentFadeBandPx: 12,
    outlineColor: [0, 0, 0, 0.1],
    outlineEmFrac: 0.16,
  },
  supercluster: {
    labelColor: hexToGl('#FFCC80'),
    minPixelSize: 35,
    maxPixelSize: 150,
    worldEmMpc: 5.0,
    pixelWidth: 2,
    // Same dim+saturate treatment as cluster, pushed slightly further
    // toward orange to distinguish from cluster yellow.  SC halos span
    // ~50 Mpc (vs clusters' ~2 Mpc) so even at lower RGB the larger
    // additive footprint still reads clearly.
    haloColor: hexToGl('#996B3666'),
    ringColor: hexToGl('#996B3666'),
    markerMaxApparentRadiusPx: 700,
    markerMaxApparentFadeBandPx: 400,
    // Superclusters span ~20–100 Mpc; their projected ring is huge
    // even at far zoom, and a small-but-visible SC ring tends to wrap
    // most of the viewport with sub-readable chrome.  Higher floor
    // than clusters so they drop from the view a bit earlier — the
    // proportionally larger structure earns a bigger pixel budget
    // before it's worth drawing.
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
    // Famous galaxies skip produceMarkers (haloColor === null) and use
    // their own per-POI minApparentSizePx + fadeBandPx gate in
    // produceLabels.  These values are sentinels — a 0 / 1 ramp at the
    // far end never visibly trips.
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
    // Voids: cyan tint per spec §2.1.  Halo carries a reduced at-rest
    // alpha (~0.65) so voids read as 'subtle presence' rather than the
    // 'pure absence' the original spec called for — the dim glow
    // distinguishes void anchors from clusters at-a-glance while still
    // staying quieter than the fully-opaque cluster halos.  null here
    // would opt out of the halo pass entirely.
    haloColor: hexToGl('#73B3D9A5'),
    ringColor: hexToGl('#73B3D9'),
    markerMaxApparentRadiusPx: 700,
    markerMaxApparentFadeBandPx: 400,
    // Voids are the largest structure anchors (~30–100+ Mpc).  Same
    // reasoning as superclusters: their projected ring wraps a huge
    // chunk of the viewport at far zoom, so a higher floor avoids
    // sub-readable chrome.  Matches the SC tuning.
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

const ALL_CATEGORIES_VISIBLE: Readonly<Record<PoiCategory, boolean>> = {
  cluster: true,
  supercluster: true,
  famousGalaxy: true,
  void: true,
};

export function createPoiSubsystem(_input: CreatePoiSubsystemInput = {}): PoiSubsystem {
  // One-shot fade-in flag for the 'poi' label layer. Flips true on
  // the first frame that emits a non-empty label set.
  let didFireFadeIn = false;
  let pois: readonly PointOfInterest[] = [];
  // Two independent visibility axes.  `markerVisibility` gates the
  // ring + halo descriptors in `produceMarkers`; `labelVisibility`
  // gates the text labels in `produceLabels`.  Both default to "every
  // category on"; the SettingsPanel flips one without affecting the
  // other.
  let markerVisibility: Readonly<Record<PoiCategory, boolean>> = ALL_CATEGORIES_VISIBLE;
  let labelVisibility: Readonly<Record<PoiCategory, boolean>> = ALL_CATEGORIES_VISIBLE;

  function setPois(next: readonly PointOfInterest[]): void {
    // Defensive copy — caller can mutate their array freely without
    // bleeding through to our internal state.
    pois = [...next];
  }

  function clearPois(): void {
    pois = [];
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
    // is unaffected, which is the bug-fix the 2026-05-19 settings-panel
    // audit (Q11) called out: hiding labels for clusters used to also
    // hide their rings.
    labelVisibility = { ...labelVisibility, [category]: visible };
  }

  function findPoi(id: string): PointOfInterest | null {
    // O(n) walk; n ≤ ~50 (clusters + SCs + voids + famous galaxies),
    // so this is invisible at the budget level even when the
    // selectionSubsystem looks up POI hovers per pick frame.
    return pois.find((p) => p.id === id) ?? null;
  }

  function getPoisForCategory(category: PoiCategory): readonly PointOfInterest[] {
    // O(n) filter over the POI table.  n is ≤ ~50 (clusters + SCs +
    // voids + famous galaxies combined) and this is only called from
    // the click resolver, so cost is invisible at the budget level
    // even on slow phones.  See the PoiSubsystem type docstring for
    // why this is the canonical accessor for pick-index → POI lookup.
    return pois.filter((p) => p.category === category);
  }

  function produceLabels(state: EngineState, ctx: ReadyFrameContext): LabelProducerOutput {
    const labels: Label[] = [];
    const lines: MarkerLine[] = [];
    // Recover the vertical fov from the per-frame `drawPxPerRad`:
    //   drawPxPerRad = canvasSize.height / (2 * tan(fovY/2))
    // ⇒ fovY = 2 * atan(canvasSize.height / (2 * drawPxPerRad))
    // We do this rather than carrying fovY directly on ReadyFrameContext
    // because `drawPxPerRad` is the already-derived scalar every other
    // per-frame consumer reads from.
    const halfH = ctx.canvasSize.height * 0.5;
    const fovYRad = 2 * Math.atan(halfH / ctx.drawPxPerRad);
    const [cx, cy, cz] = ctx.drawCamPos;
    // Capture the live-tuning override once per frame — reads are
    // cheap, but a consistent snapshot matters when the loop crosses
    // many POIs.  The director will not call produceLabels again
    // within the same frame.  See `labelStyleOverride.ts` for the
    // module-scoped state's rationale.
    const override = getLabelStyleOverride();
    for (const p of pois) {
      // Label-axis gate.  Markers consult their own `markerVisibility`
      // record in `produceMarkers` below — flipping a category's label
      // visibility off here leaves its ring + halo marker intact, and
      // vice versa.
      if (!labelVisibility[p.category]) continue;
      // Anchor gate.  A structure label (cluster / supercluster / void)
      // needs its ring marker as a visual anchor — a floating label
      // with no ring reads as orphaned text in space.  `famousGalaxy`
      // is exempt because its anchor is the galaxy point itself, not a
      // ring marker (and famous galaxies don't appear in
      // `markerVisibility`'s STRUCTURE_CATEGORIES batch at all).
      if (p.category !== 'famousGalaxy' && !markerVisibility[p.category]) continue;
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
      // smoothstep fade in the band above it).  Only the famousGalaxy arm
      // carries the threshold + diameter; structure arms never gate on
      // apparent size.  Runs only when both fields are set — see the type
      // doc on `apparentDiameterKpc` for the permissive-default rationale.
      let fadeAlpha = 1;
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
        if (style.fadeBandPx !== undefined) {
          const t = Math.min(1, (sizePx - p.minApparentSizePx) / style.fadeBandPx);
          // smoothstep — same shape as youAreHereAlpha's transition.
          fadeAlpha = t * t * (3 - 2 * t);
          // No `awake` signal here: fadeAlpha is a pure function of camera
          // distance, so any change to it is caused by camera motion, which
          // already wakes the loop via tweens / spaceMouse / pointer events.
          // Setting awake whenever fadeAlpha sits in the partial band would
          // pin the render loop on whenever a POI happens to be mid-fade.
        }
      }

      // Marker close-approach fade-out applied to the LABEL as well.
      // When the ring/halo has grown past markerMaxApparentRadiusPx and
      // is fading out (the cluster fills the viewport, user has zoomed
      // in to inspect member galaxies), the floating label is just
      // chrome at that point — fading it with the ring hands the view
      // back to the surrounding galaxies.  Mirrors the exact smoothstep
      // produceMarkers uses (lines further down) so the label and ring
      // disappear together rather than the label lingering after the
      // ring is gone.  Skips the whole label when fully faded — same
      // `continue` semantics as the min-apparent-size gate above.
      //
      // Uses the apparent (wider) radius because that's what drives the
      // ring's actual on-screen size; the core radius is irrelevant to
      // when the user "fills the viewport" with the cluster.  Only the
      // structure arms have a radius — famous galaxies skip this block
      // (their per-POI minApparentSizePx gate above handles the far-end
      // fade).
      const markerRadiusMpc =
        p.category === 'famousGalaxy' ? undefined : (p.apparentRadiusMpc ?? p.physicalRadiusMpc);
      if (markerRadiusMpc !== undefined && distanceMpc > 0.001) {
        const apRadPx = (markerRadiusMpc / distanceMpc) * (halfH / Math.tan(fovYRad * 0.5));
        if (apRadPx > style.markerMaxApparentRadiusPx) {
          const t = Math.min(
            1,
            (apRadPx - style.markerMaxApparentRadiusPx) / style.markerMaxApparentFadeBandPx,
          );
          const markerFadeOut = 1 - t * t * (3 - 2 * t);
          if (markerFadeOut <= 0) continue;
          // No `awake` signal here for the same reason produceLabels'
          // fade-in band doesn't set one: the fade is a pure function
          // of camera distance, and camera motion already wakes the
          // loop (tweens / spaceMouse / pointer events).  Setting
          // awake mid-band would pin the render loop on while a POI
          // happens to be mid-fade.
          fadeAlpha = Math.min(fadeAlpha, markerFadeOut);
        }
        // Far-distance fade-out — mirrors the min-radius branch in
        // produceMarkers so the label disappears together with its
        // ring at far zoom.  Without this the ring fades but the text
        // label keeps drawing at full alpha, leaving orphaned chrome
        // when the camera pulls back from a structure.  Famous galaxies
        // skip this block entirely (no markerRadiusMpc) — their own
        // per-POI minApparentSizePx gate above handles the far-end fade.
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
      // POI labels without an explicit lift (clusters / superclusters /
      // voids) anchor at the ring centre and centre on both axes so
      // the text sits symmetrically over the marker.  Famous galaxies
      // override below by setting labelAnchorOffsetMpc — they shift
      // up in world-Y and use horizontal centring around the line.
      let alignX: 'left' | 'center' | 'right' = 'center';
      let alignY: 'baseline' | 'center' | 'top' | 'bottom' = 'center';
      if (p.category === 'famousGalaxy' && p.labelAnchorOffsetMpc !== undefined) {
        const offset = p.labelAnchorOffsetMpc;
        labelWorldPos = [p.worldPos[0], p.worldPos[1] + offset, p.worldPos[2]];
        alignX = 'center';
        alignY = 'baseline';
        // lineColor is optional on CategoryStyle — only categories whose
        // POIs ever set `labelAnchorOffsetMpc` need to declare it (today:
        // famousGalaxy).  If a category opts into the offset-label idiom
        // without specifying a lineColor, we skip the connecting line
        // rather than crashing — the label still renders at the lifted
        // position; just without the visual anchor.
        if (style.lineColor !== undefined) {
          lines.push({
            id: `${p.id}-anchor`,
            fromWorld: [p.worldPos[0], p.worldPos[1], p.worldPos[2]],
            toWorld: [p.worldPos[0], p.worldPos[1] + offset * 0.75, p.worldPos[2]],
            pixelWidth: style.pixelWidth,
            color: [...style.lineColor],
            fadeAlpha,
          });
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

      labels.push({
        id: p.id,
        worldPos: labelWorldPos,
        text: p.name,
        font: 'cormorant',
        pixelSize: 0, // legacy field — ignored by the new worldEm sizing model
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
      });
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
    // Selected POI id (if any) — read straight off the selection
    // subsystem each frame so produceMarkers stays a pure function of
    // engine state.  Galaxy selections leave this null, which means
    // no ring gets the selection-bump alpha.
    const sel = state.subsystems.selection.selected();
    const selectedPoiId = sel !== null && sel.kind === 'poi' ? sel.id : null;

    for (const p of pois) {
      // Marker-axis gate only.  See the symmetric comment in
      // `produceLabels` — these two records are deliberately
      // independent so the SettingsPanel can offer separate "show
      // markers" vs "show labels" master toggles.
      if (!markerVisibility[p.category]) continue;
      // Famous galaxies opt out of the marker pass entirely — they have
      // no radius and render curated thumbnails on close approach instead.
      // Skipping early narrows `p` to the structure arms so the radius
      // read below is type-safe.
      if (p.category === 'famousGalaxy') continue;
      // The marker pass renders at the WIDER apparent extent (named
      // cluster extent, not the virial core).  Fall back to the core for
      // structures that only set physicalRadiusMpc.
      const radiusMpc = p.apparentRadiusMpc ?? p.physicalRadiusMpc;
      const style: CategoryStyle = POI_STYLES[p.category];

      const dx = p.worldPos[0] - cx;
      const dy = p.worldPos[1] - cy;
      const dz = p.worldPos[2] - cz;
      const distanceMpc = Math.hypot(dx, dy, dz);
      if (distanceMpc < 0.001) continue; // camera on top of POI — skip rather than NaN

      // Apparent on-screen radius in pixels.
      const apparentRadiusPx = (radiusMpc / distanceMpc) * pxPerRad;

      // Max-apparent-radius fade-out: smoothstep alpha from 1 → 0 as
      // the projected ring grows past markerMaxApparentRadiusPx into
      // the fade band.  Above the band: alpha = 0 (skip).
      let maxFadeAlpha = 1;
      if (apparentRadiusPx > style.markerMaxApparentRadiusPx) {
        const t = Math.min(
          1,
          (apparentRadiusPx - style.markerMaxApparentRadiusPx) / style.markerMaxApparentFadeBandPx,
        );
        // Smoothstep, then invert so we fade 1 → 0.
        maxFadeAlpha = 1 - t * t * (3 - 2 * t);
      }
      if (maxFadeAlpha <= 0) continue; // fully faded

      // Far-distance fade-out: symmetric counterpart to the close-
      // approach maxFadeAlpha above.  When the projected ring shrinks
      // past `markerMinApparentRadiusPx` the anchor stops being a
      // legible structure marker — clusters become illegible chrome,
      // labels float without a visible ring underneath them.  Smoothstep
      // from 0 → 1 across the band so rings don't pop as the camera
      // pulls back.  Same render-on-demand rationale as the max-radius
      // fade: no `awake` signal — camera motion already wakes the loop.
      let minFadeAlpha: number;
      if (apparentRadiusPx < style.markerMinApparentRadiusPx) {
        minFadeAlpha = 0;
      } else if (
        apparentRadiusPx <
        style.markerMinApparentRadiusPx + style.markerMinApparentFadeBandPx
      ) {
        const t =
          (apparentRadiusPx - style.markerMinApparentRadiusPx) / style.markerMinApparentFadeBandPx;
        minFadeAlpha = t * t * (3 - 2 * t);
      } else {
        minFadeAlpha = 1;
      }
      if (minFadeAlpha <= 0) continue;

      const fadeAlpha = Math.min(maxFadeAlpha, minFadeAlpha);

      // Halo Vec4: bake style at-rest alpha × per-frame fade into the
      // descriptor's alpha channel.  Voids opt out via null haloColor
      // and emit a fully-transparent [0,0,0,0] (the renderer's halo
      // pass skips alpha==0 instances entirely).
      const haloColor: Vec4 =
        style.haloColor !== null
          ? [
              style.haloColor[0],
              style.haloColor[1],
              style.haloColor[2],
              style.haloColor[3] * fadeAlpha,
            ]
          : [0, 0, 0, 0];

      // Ring Vec4: same fade bake as halo, plus the selection bump.
      // The focused POI's ring alpha is multiplied by 1.5 (capped at
      // 1.0) so it visually pops out of its neighbours.  1.5× was
      // chosen empirically as "noticeable but not jarring"; the cap
      // keeps already-full-opacity rings from overflowing.  Wrapped
      // in a fresh tuple (rather than mutated in place) to preserve
      // descriptor immutability — the selection path stays a pure
      // transform on the per-frame output, no shared references
      // between frames.
      const isSelected = p.id === selectedPoiId;
      const ringAlphaBase = style.ringColor[3] * fadeAlpha;
      const ringAlpha = isSelected ? Math.min(1, ringAlphaBase * 1.5) : ringAlphaBase;
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

  // Built as a `const` (rather than returned inline) so we can attach
  // the `satisfies Destroyable` latch — the POI subsystem is one of
  // the engine's ~13 teardown targets, and the shared shape lets
  // engine.destroy() iterate uniformly across the bag.
  const subsystem: PoiSubsystem = {
    id: 'pois',
    produceLabels,
    produceMarkers,
    setPois,
    clearPois,
    setCategoryMarkerVisible,
    setCategoryLabelVisible,
    findPoi,
    getPoisForCategory,
    destroy(): void {
      // Intentionally empty — see the type-level docstring for why.
    },
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
