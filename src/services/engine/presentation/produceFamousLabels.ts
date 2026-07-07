/**
 * produceFamousLabels — per-frame text labels for the curated famous galaxies,
 * derived entirely from `galaxyStore` (the famous `.bin` catalog joined with
 * its `famousMeta` sidecar).
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
 * `labelEnabled` being false AND the `galaxyNames` opacity having reached 0 — so
 * a toggle-off keeps
 * emitting at the declining `layerAlpha` until the fade-out ramp completes,
 * rather than popping the labels instantly (mirrors `filamentsPass.enabled`).
 * The OTHER early returns (meta/catalog absent — nothing to fade) stay hard.
 *
 * ### Meta ⋈ catalog alignment
 *
 * `famous.bin` is built in lock-step with `famous_meta.json` (same ordering),
 * so meta entry at index `i` maps to catalog row `i`. The Milky Way is a
 * first-class FocusableTarget, not a famous-meta row, so it never appears here;
 * `produceMilkyWayLabel` labels the user's own position separately.
 *
 * ### galaxyNames opacity × uniform focus recession bakes into fadeAlpha
 *
 * Each label's final `fadeAlpha` is the apparent-size distance fade multiplied
 * by two composed strands (see `focusRecession.ts`): the `galaxyNames` toggle's
 * opacity (`opacityOf({labelLayer, galaxyNames})`, read from the FadeRegistry)
 * and the focus recession factor. Famous labels reuse the SAME `galaxyNames`
 * handle and recede UNIFORMLY — there is no structure-membership link at this
 * producer, so (unlike `produceStructureLabels`) no famous label is exempt from
 * recession. The layer factor is the same for every famous label, so it's
 * snapshotted once before the loop and folded into both the label's and its
 * anchor line's `fadeAlpha` so the connector fades in lockstep with its label.
 *
 * ### Pure reader of the galaxyNames opacity
 *
 * This producer only READS `fades.opacityOf({labelLayer, galaxyNames})` — the
 * visibility bridge (`syncVisibilityFades`) is the sole writer of the layer's
 * intent opacity, seeding and ramping it from the `famousGalaxy.labelEnabled`
 * setting. The producer never drives a fade of its own.
 *
 * ### No declutter here — the director owns it
 *
 * Like `produceStructureLabels`, this emits every surviving candidate tagged
 * with a `prominencePx` (the galaxy's apparent diameter); the
 * `labelDirectorSubsystem` declutters across all producers in its merge step.
 */

import type { Label } from '../../../@types/rendering/Label';
import type { MarkerLine } from '../../../@types/rendering/MarkerLine';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { LabelProducerOutput } from '../../../@types/engine/subsystems/LabelProducerOutput';
import type { FamousMetaEntry } from '../../../@types/loading/FamousMetaEntry';
import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import { Source } from '../../../data/sources';
import { apparentSizePx } from '../../../utils/math/apparentSizePx';
import { focusedFamousIndex } from '../helpers/focusedFamousIndex';
import { famousDisplayName } from '../helpers/famousDisplayName';
import { FAMOUS_LABEL_STYLE } from './famousLabelStyle';
import { focusRecession } from './focusRecession';

const FAMOUS_MIN_APPARENT_PX = 6;

/**
 * Minimum vertical lift, in Mpc, applied to a famous-galaxy label. Tiny
 * galaxies (<~33 kpc) get this fixed offset so the label clears the dot even
 * when the galaxy itself is barely resolved.
 */
const FAMOUS_LABEL_MIN_OFFSET_MPC = 0.05;
/**
 * Multiplier on the galaxy's physical diameter when computing the label lift.
 * 1.5× means the label sits ~1.5 galaxy-diameters above the dot — so the lift
 * scales with apparent size at any zoom.
 */
const FAMOUS_LABEL_OFFSET_FACTOR = 1.5;

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
 * The famous-galaxy fields the label math needs, derived per frame from the
 * catalog ⋈ meta join. A transient local shape rather than stored data.
 */
type FamousLabelInput = {
  readonly id: string;
  readonly name: string;
  readonly worldPos: Vec3;
  readonly apparentDiameterKpc: number;
  readonly minApparentSizePx: number;
  readonly labelAnchorOffsetMpc: number;
  readonly labelWorldEmMpc: number;
};

/**
 * Zip the meta sidecar with the famous catalog rows into label inputs. The
 * meta array is loaded from `famous_meta.json` in lock-step with `famous.bin`,
 * so row `i` of the meta maps to row `i` of the catalog.
 */
function deriveFamousLabelInputs(
  meta: readonly FamousMetaEntry[],
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
    const diameterMpc = diameterKpc / 1000;
    out.push({
      id: `famous-${e.id}`,
      name: famousDisplayName(e),
      worldPos: [x, y, z],
      apparentDiameterKpc: diameterKpc,
      minApparentSizePx: FAMOUS_MIN_APPARENT_PX,
      labelAnchorOffsetMpc: Math.max(
        FAMOUS_LABEL_MIN_OFFSET_MPC,
        FAMOUS_LABEL_OFFSET_FACTOR * diameterMpc,
      ),
      labelWorldEmMpc: famousLabelWorldEmMpc(diameterKpc),
    });
    catalogIdx += 1;
  }
  return out;
}

export function produceFamousLabels(
  state: EngineState,
  ctx: ReadyFrameContext,
): LabelProducerOutput {
  const galaxies = state.data.galaxies;
  const fades = state.subsystems.fades;
  const now = ctx.nowMs;
  const empty: LabelProducerOutput = { labels: [], lines: [], awake: false };
  // Render while the user wants famous labels OR the `galaxyNames` fade-out
  // tail is still non-zero — so a toggle-off fades out smoothly instead of
  // popping (mirrors `filamentsPass.enabled`). Once opacity hits 0 we stop.
  if (
    !state.settings.galaxyCatalogs.items.famousGalaxy.labelEnabled &&
    fades.opacityOf({ kind: 'labelLayer', layer: 'galaxyNames' }, now) === 0
  ) {
    return empty;
  }

  const meta = galaxies.famousMeta;
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

  const labels: Label[] = [];
  const lines: MarkerLine[] = [];

  const fovYRad = ctx.fovYRad;
  const [cx, cy, cz] = ctx.drawCamPos;
  const style = FAMOUS_LABEL_STYLE;

  // Snapshot the layer opacity × uniform recession × clip factor ONCE — it's
  // identical for every famous label (the `galaxyNames` handle is shared, and
  // there is no per-member focus exemption here). Folded into each label +
  // anchor-line fadeAlpha below. `fades`/`now` were snapshotted at the top for
  // the opacity-aware visibility gate; reuse them rather than re-reading the clock.
  // The clip factor addresses the `'surveyLabel'` key — the VisibilityLayerKey
  // that `fadeIdToVisibilityKey` maps `galaxyNames` to.
  const clipFactor = state.subsystems.clipPlayer.clipOpacityOf('surveyLabel', now);
  const layerAlpha =
    fades.opacityOf({ kind: 'labelLayer', layer: 'galaxyNames' }, now) *
    focusRecession({ kind: 'labelLayer', layer: 'galaxyNames' }, ctx.focusBlend) *
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

    // Lift the label a static world-space distance above the dot, with a
    // short connecting line from the dot to 75% of the lift. The offset is
    // static world-space (not a per-frame camera-distance conversion) because
    // the labelDirector's signature optimisation excludes worldPos — a
    // per-frame-derived position would freeze at the first-visible distance.
    const offset = p.labelAnchorOffsetMpc;
    const labelWorldPos: Vec3 = [p.worldPos[0], p.worldPos[1] + offset, p.worldPos[2]];
    lines.push({
      id: `${p.id}-anchor`,
      fromWorld: [p.worldPos[0], p.worldPos[1], p.worldPos[2]],
      toWorld: [p.worldPos[0], p.worldPos[1] + offset * 0.75, p.worldPos[2]],
      pixelWidth: style.pixelWidth,
      color: [...style.lineColor],
      fadeAlpha: labelAlpha,
      // Anchor for this label — the director drops the connector if the label
      // loses an overlap during declutter.
      ownerLabelId: p.id,
    });

    labels.push({
      id: p.id,
      worldPos: labelWorldPos,
      text: p.name,
      font: 'cormorant',
      pixelSize: 0, // unused — superseded by the worldEm sizing model
      color: [...style.labelColor],
      worldEmMpc: p.labelWorldEmMpc,
      minPixelSize: style.minPixelSize,
      maxPixelSize: style.maxPixelSize,
      fadeAlpha: labelAlpha,
      alignX: 'center',
      alignY: 'baseline',
      outlineColor: [...style.outlineColor],
      outlineEmFrac: style.outlineEmFrac,
      prominencePx,
    });
  }

  return { labels, lines, awake: false };
}
