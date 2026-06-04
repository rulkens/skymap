/**
 * produceFamousLabels — per-frame text labels for the curated famous galaxies,
 * derived entirely from `galaxyStore` (the famous `.bin` catalog joined with
 * its `famousMeta` sidecar).
 *
 * Extracted from the famous arm of `poiSubsystem.produceLabels` (Spec 3), and
 * folding in what `buildPoisFromFamousMeta` used to do as a separate wiring
 * phase. Famous galaxies are galaxy data, not structures — their anchor is the
 * galaxy point itself, they emit no ring/halo marker, and their visibility
 * lives on `galaxyStore.famousLabelsVisible`. The two-asset join (catalog
 * positions/diameters ⋈ meta names) now happens here, on the galaxy side.
 *
 * ### Meta ⋈ catalog alignment
 *
 * `famous.bin` is built in lock-step with `famous_meta.json` (same ordering
 * for non-pseudo entries), so a non-pseudo meta entry at index `i` maps to
 * catalog row `catalogIdx` — a counter that advances only past non-pseudo
 * rows. Pseudo entries (the Milky Way, merged at the React layer) have no
 * `.bin` counterpart and are skipped; `youAreHereSubsystem` labels the user's
 * own position. The engine's `famousMeta` comes from the bin and never holds
 * pseudo rows, but defending here keeps the join robust to future sources.
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
import type { GalaxyCatalog } from '../../../@types/data/GalaxyCatalog';
import { Source } from '../../../data/sources';
import { apparentSizePx } from '../../../utils/math/apparentSizePx';
import { famousDisplayName } from '../helpers/famousDisplayName';
import { getLabelStyleOverride } from '../labelStyleOverride';
import { FAMOUS_LABEL_STYLE } from './famousLabelStyle';

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
 * catalog ⋈ meta join. The former `FamousGalaxyPoi` arm of `PointOfInterest`,
 * now a transient local shape rather than stored data.
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
 * Zip the meta sidecar with the famous catalog rows into label inputs. Mirrors
 * the former `buildPoisFromFamousMeta`; the `catalogIdx` counter advances only
 * for non-pseudo entries so the index mapping survives mixed-in pseudo rows.
 */
function deriveFamousLabelInputs(
  meta: readonly FamousMetaEntry[],
  catalog: Pick<GalaxyCatalog, 'count' | 'positions' | 'diameterKpc'>,
): FamousLabelInput[] {
  const out: FamousLabelInput[] = [];
  let catalogIdx = 0;
  for (const e of meta) {
    if (e.pseudo === true) continue;
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
  const empty: LabelProducerOutput = { labels: [], lines: [], awake: false };
  if (!galaxies.famousLabelsVisible) return empty;

  const meta = galaxies.famousMeta;
  const catalog = galaxies.get(Source.Famous);
  if (meta.length === 0 || catalog === undefined || catalog.count === 0) return empty;

  const inputs = deriveFamousLabelInputs(meta, catalog);
  if (inputs.length === 0) return empty;

  const labels: Label[] = [];
  const lines: MarkerLine[] = [];

  // Recover the vertical fov from the per-frame `drawPxPerRad` (the scalar
  // every other per-frame consumer reads).
  const fovYRad = 2 * Math.atan((ctx.canvasSize.height * 0.5) / ctx.drawPxPerRad);
  const [cx, cy, cz] = ctx.drawCamPos;
  const style = FAMOUS_LABEL_STYLE;
  // Snapshot the live-tuning override once so it stays consistent across the
  // loop. See `labelStyleOverride.ts`.
  const override = getLabelStyleOverride();

  for (const p of inputs) {
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
      fadeAlpha,
      // Anchor for this label — the director drops the connector if the label
      // loses an overlap during declutter.
      ownerLabelId: p.id,
    });

    // Per-POI override fields apply only when the override targets the famous
    // category; otherwise the category-default outline is kept.
    const overrideFields =
      override.targetCategory === 'famousGalaxy'
        ? { outlineColor: override.outlineColor, outlineEmFrac: override.outlineEmFrac }
        : {};

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
      fadeAlpha,
      alignX: 'center',
      alignY: 'baseline',
      outlineColor: [...style.outlineColor],
      outlineEmFrac: style.outlineEmFrac,
      prominencePx,
      ...overrideFields,
    });
  }

  return { labels, lines, awake: false };
}
