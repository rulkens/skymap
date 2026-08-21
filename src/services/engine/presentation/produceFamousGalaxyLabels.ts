/**
 * produceFamousGalaxyLabels — per-frame text labels for the curated famous galaxies,
 * derived from the famous `.bin` catalog in `galaxyStore` joined with the
 * famous-galaxies meta sidecar read off `state.famousGalaxiesMeta` (the
 * engine slice).
 *
 * Famous galaxies are galaxy data, not structures — their anchor is the galaxy
 * point itself, they emit no ring/halo marker, and their label visibility lives
 * on `settings.galaxyCatalogs.items.famousGalaxy.labelEnabled` (famous is a galaxy catalog
 * source). The two-asset join (catalog positions/diameters ⋈ meta names) happens
 * here, on the galaxy side, and emits the famous labels plus their anchor lines.
 *
 * ### Opacity-aware visibility gate (fades out, doesn't pop)
 *
 * The hidden-state early return is gated on BOTH the famous-galaxy catalog
 * `labelEnabled` being false AND the `galaxy` layer opacity having reached 0 —
 * so a toggle-off keeps emitting at the declining `layerAlpha` until the
 * fade-out ramp completes, rather than popping the labels instantly (mirrors
 * `filamentsLayer.enabled`). The OTHER early returns (meta/catalog absent —
 * nothing to fade) stay hard.
 *
 * ### Meta ⋈ catalog alignment
 *
 * `famous.bin` is built in lock-step with `famous_galaxies_meta.json` (same ordering),
 * so meta entry at index `i` maps to catalog row `i`. The Milky Way is a
 * first-class FocusableTarget, not a famous-galaxies-meta row, so it never appears here;
 * `produceMilkyWayLabel` labels the user's own position separately.
 *
 * ### galaxy-layer opacity × uniform focus recession bakes into fadeAlpha
 *
 * Each label's final `fadeAlpha` is the apparent-size distance fade multiplied
 * by two composed strands (see `focusRecession.ts`): the `galaxy` layer's
 * toggle opacity (`opacityOf({labelLayer, galaxy})`, read from the
 * FadeRegistry) and the focus recession factor. Famous labels reuse the SAME
 * `galaxy` handle and recede UNIFORMLY — there is no structure-membership link
 * at this producer, so (unlike `produceStructureLabels`) no famous label is
 * exempt from recession. The layer factor is the same for every famous label,
 * so it's snapshotted once before the loop and folded into both the label's and
 * its anchor line's `fadeAlpha` so the connector fades in lockstep with its label.
 *
 * ### Pure reader of the galaxy-layer opacity
 *
 * This producer only READS `fades.opacityOf({labelLayer, galaxy})` — the
 * visibility bridge (`syncVisibilityFades`) is the sole writer of the layer's
 * intent opacity, seeding and ramping it from the `famousGalaxy.labelEnabled`
 * setting. The producer never drives a fade of its own.
 *
 * ### No declutter here — the director owns it
 *
 * Like `produceStructureLabels`, this emits every surviving candidate tagged
 * with a `prominencePx` (the galaxy's apparent diameter); the
 * `labelDirectorSubsystem` declutters across all producers in its merge step.
 *
 * ### Distance-scaled pixel ceiling for near companions
 *
 * The ceiling ramps down with camera distance so permanently-near companions
 * (LMC/SMC) don't pin the flat 150 px cap — see `famousLabelMaxPx`.
 */

import type { Label2D } from '../../../@types/rendering/Label2D';
import type { MarkerLine } from '../../../@types/rendering/MarkerLine';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Label2DProducerOutput } from '../../../@types/engine/subsystems/Label2DProducerOutput';
import type { FamousGalaxyMetaEntry } from '../../../@types/loading/FamousGalaxyMetaEntry';
import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import { Source } from '../../../data/sources';
import { apparentSizePx } from '../../../utils/math/apparentSizePx';
import { focusedFamousIndex } from '../helpers/focusedFamousIndex';
import { famousDisplayName } from '../helpers/famousDisplayName';
import { FAMOUS_LABEL_STYLE } from './famousLabelStyle';
import { liftedLabelPlacement } from './liftedLabelPlacement';
import { focusRecession } from './focusRecession';
import { smoothstep } from '../../../utils/math/smoothstep';

const FAMOUS_MIN_APPARENT_PX = 6;

/**
 * Label-size scaling for famous-galaxy labels:
 *   worldEmMpc = REFERENCE_WORLD_EM * 10^(LOG_GAIN * log10(diameterKpc / REFERENCE_KPC))
 * `REFERENCE_KPC = 40` anchors M31 (~40 kpc) at the category default;
 * `LOG_GAIN = 0.3` makes one decade in diameter ≈ 2× in worldEm. The
 * per-category pixel clamps bound the visible extremes.
 */
const FAMOUS_LABEL_REFERENCE_DIAMETER_KPC = 40;
const FAMOUS_LABEL_REFERENCE_WORLD_EM_MPC = 0.0125;
const FAMOUS_LABEL_WORLD_EM_LOG_GAIN = 0.3;

function famousLabelWorldEmMpc(diameterKpc: number): number {
  const log = Math.log10(diameterKpc / FAMOUS_LABEL_REFERENCE_DIAMETER_KPC);
  return FAMOUS_LABEL_REFERENCE_WORLD_EM_MPC * Math.pow(10, FAMOUS_LABEL_WORLD_EM_LOG_GAIN * log);
}

/**
 * Distance-scaled pixel ceiling for famous-galaxy labels. `style.maxPixelSize`
 * (150 px) is tuned for the dramatic close-approach case — M31 filling the
 * screen as the camera swoops in — but the LMC/SMC sit permanently inside
 * that same near range as seen from home, inside the Milky Way, so a
 * single fixed ceiling lets them tower over the view rather than reading as a
 * momentary flourish. The rejected alternative was lowering `maxPixelSize`
 * globally: that would also shrink the intended M31-at-close-approach drama
 * for every OTHER far galaxy, not just the ones that never recede. Ramping
 * the cap by distance instead keeps permanent near neighbours small while
 * leaving the far-galaxy ceiling untouched.
 */
const FAMOUS_LABEL_NEAR_MPC = 0.1;
const FAMOUS_LABEL_FAR_MPC = 1.0;
const FAMOUS_LABEL_NEAR_CAP_PX = 60;

function famousLabelMaxPx(distanceMpc: number): number {
  return (
    FAMOUS_LABEL_NEAR_CAP_PX +
    (FAMOUS_LABEL_STYLE.maxPixelSize - FAMOUS_LABEL_NEAR_CAP_PX) *
      smoothstep(FAMOUS_LABEL_NEAR_MPC, FAMOUS_LABEL_FAR_MPC, distanceMpc)
  );
}

/**
 * The famous-galaxy fields the label math needs, derived per frame from the
 * catalog ⋈ meta join. A transient local shape rather than stored data.
 */
type FamousLabelInput = {
  readonly id: string;
  readonly name: string;
  readonly worldPos: Vec3;
  readonly apparentDiameterKpc: number;
  readonly minApparentSizePx: number;
  readonly labelWorldEmMpc: number;
};

/**
 * Zip the meta sidecar with the famous catalog rows into label inputs. The
 * meta array is loaded from `famous_galaxies_meta.json` in lock-step with `famous.bin`,
 * so row `i` of the meta maps to row `i` of the catalog.
 */
function deriveFamousLabelInputs(
  meta: readonly FamousGalaxyMetaEntry[],
  catalog: Pick<GalaxyCatalog, 'count' | 'positions' | 'diameterKpc'>,
): FamousLabelInput[] {
  const out: FamousLabelInput[] = [];
  let catalogIdx = 0;
  for (const e of meta) {
    if (catalogIdx >= catalog.count) break; // ran past the catalog; defensive
    const x = catalog.positions[catalogIdx * 3 + 0]!;
    const y = catalog.positions[catalogIdx * 3 + 1]!;
    const z = catalog.positions[catalogIdx * 3 + 2]!;
    const diameterKpc = catalog.diameterKpc[catalogIdx]!;
    out.push({
      id: `famous-${e.id}`,
      name: famousDisplayName(e),
      worldPos: [x, y, z],
      apparentDiameterKpc: diameterKpc,
      minApparentSizePx: FAMOUS_MIN_APPARENT_PX,
      labelWorldEmMpc: famousLabelWorldEmMpc(diameterKpc),
    });
    catalogIdx += 1;
  }
  return out;
}

export function produceFamousGalaxyLabels(
  state: EngineState,
  ctx: ReadyFrameContext,
): Label2DProducerOutput {
  const galaxies = state.data.galaxies;
  const fades = state.subsystems.fades;
  const now = ctx.nowMs;
  const empty: Label2DProducerOutput = { labels: [], lines: [], awake: false };
  // Render while the user wants famous labels OR the `galaxy` fade-out
  // tail is still non-zero — so a toggle-off fades out smoothly instead of
  // popping (mirrors `filamentsLayer.enabled`). Once opacity hits 0 we stop.
  if (
    !state.settings.galaxyCatalogs.items.famousGalaxy.labelEnabled &&
    fades.opacityOf({ kind: 'labelLayer', layer: 'galaxy' }, now) === 0
  ) {
    return empty;
  }

  const meta = state.famousGalaxiesMeta;
  const catalog = galaxies.get(Source.FamousGalaxy);
  if (meta.length === 0 || catalog === undefined || catalog.count === 0) return empty;

  // focusedOnly mode: only the focused subject's label draws. A famous focus
  // is a positional catalog ref; anything else focused (a structure, the
  // Milky Way, another catalog's galaxy, nothing) silences this producer.
  const focusedIdx = state.settings.labels.focusedOnly
    ? focusedFamousIndex(state.selection.focus)
    : null;
  if (state.settings.labels.focusedOnly && focusedIdx === null) return empty;

  const inputs = deriveFamousLabelInputs(meta, catalog);
  if (inputs.length === 0) return empty;

  const labels: Label2D[] = [];
  const lines: MarkerLine[] = [];

  const fovYRad = ctx.fovYRad;
  const [cx, cy, cz] = ctx.drawCamPos;
  const style = FAMOUS_LABEL_STYLE;
  // Hoisted once — every label this frame lifts through the same vp/viewport.
  const vp: Float32Array = ctx.vp;
  const viewportPx: Vec2 = [ctx.canvasSize.width, ctx.canvasSize.height];
  // The renderer owns the font metrics, so its memoized `measure` is the one
  // source for the caption's true ink bbox (which places the line top). Null
  // only during bootstrap, when the director isn't flushing anyway — the
  // chain then degrades to a bottom at the label anchor.
  const labelRenderer = state.gpu.labelRenderer;

  // Snapshot the layer opacity × uniform recession × clip factor ONCE — it's
  // identical for every famous label (the `galaxy` handle is shared, and
  // there is no per-member focus exemption here). Folded into each label +
  // anchor-line fadeAlpha below. `fades`/`now` were snapshotted at the top for
  // the opacity-aware visibility gate; reuse them rather than re-reading the clock.
  // The clip factor addresses the `'surveyLabel'` key — the VisibilityLayerKey
  // that `fadeIdToVisibilityKey` maps `galaxy` to.
  const clipFactor = state.subsystems.clipPlayer.clipOpacityOf('surveyLabel', now);
  const layerAlpha =
    fades.opacityOf({ kind: 'labelLayer', layer: 'galaxy' }, now) *
    focusRecession({ kind: 'labelLayer', layer: 'galaxy' }, ctx.focusBlend) *
    clipFactor;

  for (let i = 0; i < inputs.length; i += 1) {
    const p = inputs[i]!;
    // Input i maps to catalog row i (the meta ⋈ catalog join is index-aligned),
    // so the positional focus ref selects by loop index.
    if (focusedIdx !== null && i !== focusedIdx) continue;
    const dx = p.worldPos[0] - cx;
    const dy = p.worldPos[1] - cy;
    const dz = p.worldPos[2] - cz;
    const distanceMpc = Math.hypot(dx, dy, dz);

    // Apparent-size gate: skip below the threshold, smoothstep fade in the
    // band above. `prominencePx` (the declutter sort key) is the galaxy's
    // apparent diameter.
    const sizePx = apparentSizePx({
      diameterKpc: p.apparentDiameterKpc,
      distanceMpc,
      viewportHeightPx: ctx.canvasSize.height,
      fovYRad,
    });
    if (sizePx < p.minApparentSizePx) continue;
    const prominencePx = sizePx;
    // Distance-scaled ceiling — see `famousLabelMaxPx`'s docblock for why the
    // category's flat 150 px cap can't stand for permanently-near companions
    // like the LMC/SMC. Computed once and reused by both the label object and
    // the placement call below.
    const maxPixelSize = famousLabelMaxPx(distanceMpc);
    let fadeAlpha = 1;
    const t = Math.min(1, (sizePx - p.minApparentSizePx) / style.fadeBandPx);
    fadeAlpha = t * t * (3 - 2 * t); // smoothstep
    // No `awake` signal: fadeAlpha is a pure function of camera distance, and
    // camera motion already wakes the loop. Pinning awake mid-band would keep
    // the loop on whenever a galaxy is fading.

    // Fold the layer opacity × recession into the distance fade. The same
    // `labelAlpha` drives both the label and its anchor line so the connector
    // fades in lockstep with its label.
    const labelAlpha = fadeAlpha * layerAlpha;

    // Build the label BEFORE its geometry so `measure` reads the same font /
    // text / alignment fields the final label carries — the measured ink
    // bottom that positions the line top can never drift from what is drawn.
    // `worldPos` here is provisional (the dot); the push below replaces it
    // with the lifted anchor.
    const label: Label2D = {
      id: p.id,
      worldPos: p.worldPos,
      text: p.name,
      font: 'cormorant',
      pixelSize: 0, // unused — superseded by the worldEm sizing model
      color: [...style.labelColor],
      worldEmMpc: p.labelWorldEmMpc,
      minPixelSize: style.minPixelSize,
      maxPixelSize,
      fadeAlpha: labelAlpha,
      alignX: 'center',
      alignY: 'baseline',
      outlineColor: [...style.outlineColor],
      outlineEmFrac: style.outlineEmFrac,
      prominencePx,
    };

    // Single derivation chain (see `liftedLabelPlacement`): the lift is
    // screen-space (world +Y offsets foreshorten or fall over the text), the
    // line top derives from the measured text bottom minus the shared
    // padding, and the line vanishes when no room remains. The endpoints are
    // camera-derived per frame — safe because the labelDirector's re-upload
    // signature keys on each line's `toWorld`, so moved geometry re-uploads
    // instead of freezing at first-visible distance.
    const placement = liftedLabelPlacement({
      anchorWorldPos: p.worldPos,
      vp,
      viewportPx,
      subjectSizePx: sizePx,
      textBbox: labelRenderer?.measure(label) ?? null,
      worldEmMpc: p.labelWorldEmMpc,
      minPixelSize: style.minPixelSize,
      maxPixelSize,
    });
    // Behind the camera the projection is undefined — nothing visible to label.
    if (placement === null) continue;

    labels.push({ ...label, worldPos: placement.labelWorldPos });
    if (placement.line !== null) {
      lines.push({
        id: `${p.id}-anchor`,
        fromWorld: placement.line.fromWorld,
        toWorld: placement.line.toWorld,
        pixelWidth: style.pixelWidth,
        color: [...style.lineColor],
        fadeAlpha: labelAlpha,
        // Anchor for this label — the director drops the connector if the
        // label loses an overlap during declutter.
        ownerLabelId: p.id,
      });
    }
  }

  return { labels, lines, awake: false };
}
