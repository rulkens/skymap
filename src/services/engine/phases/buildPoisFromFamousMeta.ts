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
 * Label-size scaling parameters for famous-galaxy POIs.  Pixel size
 * is `BASE + LOG_GAIN * log10(diameterKpc / REFERENCE_DIAMETER_KPC)`,
 * clamped to `[MIN, MAX]`.  Anchored so a typical Milky-Way-class
 * galaxy (~40 kpc, like M31) sits at the reference 18 px — same as
 * "You are here".  LOG_GAIN of 7 is tuned so a dwarf one log-decade
 * below the reference (4 kpc, e.g. M110) reads at ~11 px (~60% of
 * Andromeda's label) and a dwarf 1.5 decades below (1.8 kpc, e.g.
 * M32) hits the 9 px floor (50% — the "about half" target).  Reading
 * floor 9 px is the minimum legible size for the Cormorant font at
 * typical viewer distances; ceiling 22 px keeps the largest spirals
 * from dominating the overlay.
 */
const FAMOUS_LABEL_BASE_PX = 18;
const FAMOUS_LABEL_REFERENCE_DIAMETER_KPC = 40;
const FAMOUS_LABEL_LOG_GAIN = 7;
const FAMOUS_LABEL_MIN_PX = 9;
const FAMOUS_LABEL_MAX_PX = 22;

function famousLabelPixelSize(diameterKpc: number): number {
  const raw =
    FAMOUS_LABEL_BASE_PX +
    FAMOUS_LABEL_LOG_GAIN * Math.log10(diameterKpc / FAMOUS_LABEL_REFERENCE_DIAMETER_KPC);
  return Math.max(FAMOUS_LABEL_MIN_PX, Math.min(FAMOUS_LABEL_MAX_PX, raw));
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
      labelPixelSize: famousLabelPixelSize(diameterKpc),
    });
    catalogIdx += 1;
  }
  return out;
}
