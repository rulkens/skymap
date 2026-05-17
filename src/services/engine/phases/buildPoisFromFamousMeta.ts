/**
 * buildPoisFromFamousMeta — assemble PointOfInterest records from the
 * famous-galaxy meta sidecar + the loaded famous.bin galaxy catalog.
 *
 * ### Why a separate module
 *
 * `wireSlots.ts` already covers the static cluster/supercluster/void
 * anchor wiring inline.  The Famous wiring is more involved (needs
 * meta + catalog, runs after both are ready, handles pseudo entries +
 * name resolution), so isolating it here keeps `wireSlots.ts`
 * scannable and makes the producer unit-testable without booting the
 * whole bootstrap.
 *
 * ### Name resolution
 *
 * Delegated to `famousDisplayName(entry)` — the same helper the
 * InfoCard headline uses.  Single call site means the two surfaces
 * can't drift.
 *
 * ### Pseudo entries
 *
 * Entries with `pseudo: true` (currently just the Milky Way merged
 * in at the React layer; not present in `famous.bin` itself) are
 * skipped — `youAreHereSubsystem` already labels the user's position
 * and the meta array index doesn't line up with the catalog index for
 * pseudo rows.  In practice the engine's `state.sources.famousMeta`
 * comes from the bin and never contains pseudo entries, but defending
 * against the hybrid case here keeps the producer robust to future
 * meta-source changes.
 *
 * ### worldPos lookup by index
 *
 * `famous.bin` is built in lock-step with `famous_meta.json` — the
 * same ordering for non-pseudo entries — so a non-pseudo meta entry
 * at index `i` corresponds to catalog positions[i*3..i*3+3].  We track
 * a separate `catalogIdx` counter that advances only for non-pseudo
 * entries to keep the mapping correct even when pseudo entries are
 * mixed in.
 *
 * ### apparentSizePx gating
 *
 * Every Famous POI sets `minApparentSizePx: 6` and
 * `apparentDiameterKpc: catalog.diameterKpc[i]`.  See `poiSubsystem.ts`
 * for the gate semantics.  The 6 px threshold is the same value the
 * engine uses for thumbnail-enqueue gating, so labels appear at
 * roughly the same zoom as the underlying thumbnail.
 */

import type { FamousMetaEntry } from '../../../@types/loading/FamousMetaEntry';
import type { GalaxyCatalog } from '../../../@types/data/GalaxyCatalog';
import type { PointOfInterest } from '../../../@types/engine/subsystems/PointOfInterest';
import { famousDisplayName } from '../helpers/famousDisplayName';

const FAMOUS_MIN_APPARENT_PX = 6;

/**
 * Minimum vertical lift, in Mpc, applied to a famous-galaxy label.
 * Tiny galaxies (<~33 kpc, i.e. the floor / 1.5) get this fixed offset
 * so the label clears the dot even when the galaxy itself is barely
 * resolved.  See the section in `poiSubsystem.ts`'s module header on
 * the static-offset rationale.
 */
const FAMOUS_LABEL_MIN_OFFSET_MPC = 0.05;
/**
 * Multiplier on the galaxy's physical diameter when computing the
 * label lift.  1.5× means the label sits ~1.5 galaxy-diameters above
 * the dot — so when the galaxy is N px on screen, the label is ~1.5N
 * px above (because both scale identically with camera distance).
 * Visually keeps the label clearly above the galaxy disk at any zoom.
 */
const FAMOUS_LABEL_OFFSET_FACTOR = 1.5;

/**
 * Label-size scaling for famous-galaxy POIs.
 *
 * The shader projects `Label.worldEmMpc` through perspective to obtain a
 * screen-pixel height, clamped to `[minPixelSize, maxPixelSize]` from the
 * `POI_STYLES.famousGalaxy` category (see `poiSubsystem.ts`).  A bigger
 * galaxy therefore gets a bigger worldEmMpc and thus a naturally larger
 * label at any zoom, while the pixel clamps keep legibility bounded.
 *
 * ### Tuning
 *
 *   worldEmMpc = REFERENCE_WORLD_EM * 10^(LOG_GAIN * log10(diameterKpc / REFERENCE_KPC))
 *
 * `REFERENCE_KPC = 40` anchors M31 (~40 kpc) at `REFERENCE_WORLD_EM = 0.005` Mpc,
 * matching the `famousGalaxy` category default.  `LOG_GAIN = 0.3` is tuned so
 * one decade in diameter (e.g. 4 kpc → 40 kpc) yields roughly 2× in worldEmMpc.
 * The per-category pixel clamps handle extreme cases — there is no explicit
 * per-POI min/max clamping here.
 */
const FAMOUS_LABEL_REFERENCE_DIAMETER_KPC = 40;
const FAMOUS_LABEL_REFERENCE_WORLD_EM_MPC = 0.005;
const FAMOUS_LABEL_WORLD_EM_LOG_GAIN = 0.3; // 1 decade in diameter → ~2× in worldEm

function famousLabelWorldEmMpc(diameterKpc: number): number {
  const log = Math.log10(diameterKpc / FAMOUS_LABEL_REFERENCE_DIAMETER_KPC);
  return FAMOUS_LABEL_REFERENCE_WORLD_EM_MPC * Math.pow(10, FAMOUS_LABEL_WORLD_EM_LOG_GAIN * log);
}

export function buildPoisFromFamousMeta(
  meta: readonly FamousMetaEntry[],
  catalog: Pick<GalaxyCatalog, 'count' | 'positions' | 'diameterKpc'>,
): PointOfInterest[] {
  if (meta.length === 0 || catalog.count === 0) return [];
  const out: PointOfInterest[] = [];
  let catalogIdx = 0;
  for (const e of meta) {
    if (e.pseudo === true) continue;
    if (catalogIdx >= catalog.count) break; // ran past the catalog; defensive
    const x = catalog.positions[catalogIdx * 3 + 0]!;
    const y = catalog.positions[catalogIdx * 3 + 1]!;
    const z = catalog.positions[catalogIdx * 3 + 2]!;
    const diameterKpc = catalog.diameterKpc[catalogIdx]!;
    const diameterMpc = diameterKpc / 1000;
    const labelAnchorOffsetMpc = Math.max(
      FAMOUS_LABEL_MIN_OFFSET_MPC,
      FAMOUS_LABEL_OFFSET_FACTOR * diameterMpc,
    );
    out.push({
      id: `famous-${e.id}`,
      name: famousDisplayName(e),
      category: 'famousGalaxy',
      worldPos: [x, y, z],
      minApparentSizePx: FAMOUS_MIN_APPARENT_PX,
      apparentDiameterKpc: diameterKpc,
      labelAnchorOffsetMpc,
      labelWorldEmMpc: famousLabelWorldEmMpc(diameterKpc),
    });
    catalogIdx += 1;
  }
  return out;
}
