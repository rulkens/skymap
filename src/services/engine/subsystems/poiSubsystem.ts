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

export function createPoiSubsystem(input: CreatePoiSubsystemInput = {}): PoiSubsystem {
  // Construction-time callback bag.  Optional so the existing test
  // suite (which only exercises the marker / selection / produceLabels
  // paths) can keep constructing the subsystem with zero args.  The
  // runtime engine always passes `cb`; see `engine.ts` createPoiSubsystem
  // call site for the production wire-up.  Only `selection.onPoiHoverChange`
  // is read today — mirrors the selectionSubsystem pattern of "subsystem
  // owns its own callback fires from the same site that does the dedupe".
  const { cb } = input;
  // One-shot fade-in flag for the 'poi' label layer. Flips true on
  // the first frame that emits a non-empty label set.
  let didFireFadeIn = false;
  let pois: readonly PointOfInterest[] = [];
  // Two independent visibility axes — see the module header for the
  // history.  `markerVisibility` gates the ring + halo descriptors in
  // `produceMarkers`; `labelVisibility` gates the text labels in
  // `produceLabels`.  Both default to "every category on" so the
  // pre-split behaviour (everything visible) is preserved; the
  // SettingsPanel can now flip one without affecting the other.
  let markerVisibility: Readonly<Record<PoiCategory, boolean>> = ALL_CATEGORIES_VISIBLE;
  let labelVisibility: Readonly<Record<PoiCategory, boolean>> = ALL_CATEGORIES_VISIBLE;
  // The currently-focused POI id, or null when nothing is selected.
  // Kept as module-scoped factory state alongside `pois` / `visibility`
  // so produceMarkers can read it without an extra arg — same idiom
  // the rest of the subsystem already uses.  Selection is a pure
  // marker-side concern (it only affects ringAlpha), so it does NOT
  // need to live in EngineState.
  let selectedPoiId: string | null = null;
  // Mirror of `selectedPoiId` for the hover path.  Kept as a SEPARATE
  // field (rather than collapsed into a `{ hovered, selected }` tuple)
  // because that separation is structurally what enforces the plan-5
  // hard constraint: produceMarkers reads `selectedPoiId` only, and
  // never references `hoveredPoiId` — so a hover can't accidentally
  // bump ringAlpha.  Collapsing the two would invite a future edit
  // that reads the tuple in produceMarkers and silently breaks the
  // visual contract.
  let hoveredPoiId: string | null = null;

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

  function setSelectedPoi(poiId: string | null): void {
    if (poiId === null) {
      selectedPoiId = null;
      return;
    }
    // Defensive: only accept ids that actually appear in the current
    // POI table.  A deep-link drain firing before the POI table is
    // populated, or after a tier swap that replaced the table, would
    // otherwise leave a stale id stranded on this subsystem with no
    // matching POI to highlight.  Silently ignoring the unknown id
    // (rather than throwing) keeps URL handlers simple: they can
    // forward whatever the user pasted without pre-validating.
    const exists = pois.some((p) => p.id === poiId);
    if (!exists) return;
    selectedPoiId = poiId;
  }

  function getSelectedPoiId(): string | null {
    return selectedPoiId;
  }

  function setHoveredPoi(poiId: string | null): void {
    // Resolve the *effective* next id first so the equality short-
    // circuit and the callback fan-out both run against the same value.
    //   - null  → clear, no defensive existence check needed.
    //   - non-null but unknown id → defensively ignored.  The field
    //     stays at its prior value AND the callback does NOT fire
    //     (matching the pre-callback contract that an unknown id
    //     produces no observable change).  Same rationale as
    //     setSelectedPoi: a hover pick from the previous frame can
    //     resolve against a now-replaced POI table after a tier swap;
    //     silently dropping rather than retaining a stale id avoids
    //     leaking a phantom hover through to the React preview card.
    if (poiId !== null) {
      const exists = pois.some((p) => p.id === poiId);
      if (!exists) return;
    }
    // Equality short-circuit on the prior id — mirror of
    // selectionSubsystem.setHovered's selectionEq guard.  React
    // consumers rely on this dedupe so they don't re-render every
    // throttled pick that resolves to the same POI the cursor was
    // already over.
    if (poiId === hoveredPoiId) return;
    hoveredPoiId = poiId;
    // Callback fires AFTER the field update so any synchronous reader
    // (e.g. a getHoveredPoiId call from inside the callback itself)
    // sees the freshly-committed value.  The callback chain reads as
    // selection.onPoiHoverChange — sits next to onHoverChange (galaxy)
    // because hover is a selection-class concept (see
    // EngineCallbacks.d.ts).
    cb?.selection?.onPoiHoverChange?.(poiId);
  }

  function getHoveredPoiId(): string | null {
    return hoveredPoiId;
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
      // when the user "fills the viewport" with the cluster.
      const markerRadiusMpc = p.apparentRadiusMpc ?? p.physicalRadiusMpc;
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
      if (p.labelAnchorOffsetMpc !== undefined) {
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
        alignY,
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

  function produceMarkers(_state: EngineState, ctx: ReadyFrameContext): readonly ClusterMarkerDescriptor[] {
    const out: ClusterMarkerDescriptor[] = [];
    // The same vertical-fov recovery produceLabels does — kept local
    // so the two producers don't share mutable state.
    const halfH = ctx.canvasSize.height * 0.5;
    const fovYRad = 2 * Math.atan(halfH / ctx.drawPxPerRad);
    // pxPerRad along the screen-Y axis at the current canvas size.
    // (Same form youAreHereSubsystem and the labels use.)
    const pxPerRad = ctx.canvasSize.height * 0.5 / Math.tan(fovYRad * 0.5);
    const [cx, cy, cz] = ctx.drawCamPos;

    for (const p of pois) {
      // Marker-axis gate only.  See the symmetric comment in
      // `produceLabels` — these two records are deliberately
      // independent so the SettingsPanel can offer separate "show
      // markers" vs "show labels" master toggles.
      if (!markerVisibility[p.category]) continue;
      // The marker pass renders at the WIDER apparent extent (named
      // cluster extent, not the virial core).  Fall back to the core
      // for POIs that only set physicalRadiusMpc — none today, but
      // matches the optional-shape of both fields on PointOfInterest.
      // No radius at all → no ring → skip (famous galaxies).
      const radiusMpc = p.apparentRadiusMpc ?? p.physicalRadiusMpc;
      if (radiusMpc === undefined) continue;
      const style: CategoryStyle = POI_STYLES[p.category];
      // ringColor === null guards a never-happens path; we use
      // haloColor === null to mean "label-only category".  Famous
      // galaxies always hit this branch.
      if (style.haloColor === null && p.category === 'famousGalaxy') continue;

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

      // Apparent-size fade-IN band reuses produceLabels' logic — only
      // applies when both minApparentSizePx AND apparentDiameterKpc are
      // set.  For cluster / SC / void anchors neither is set, so the
      // fade-in alpha defaults to 1 (always visible above 0 distance).
      // Implementer note: if a future POI wants a min-size fade-in for
      // markers, mirror the produceLabels logic here.
      const minFadeAlpha = 1;

      const fadeAlpha = Math.min(maxFadeAlpha, minFadeAlpha);

      // Halo Vec4: bake style at-rest alpha × per-frame fade into the
      // descriptor's alpha channel.  Voids opt out via null haloColor
      // and emit a fully-transparent [0,0,0,0] (the renderer's halo
      // pass skips alpha==0 instances entirely).
      const haloColor: Vec4 = style.haloColor !== null
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
    setSelectedPoi,
    getSelectedPoiId,
    setHoveredPoi,
    getHoveredPoiId,
    getPoisForCategory,
    destroy(): void {
      // Intentionally empty — see the type-level docstring for why.
    },
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
