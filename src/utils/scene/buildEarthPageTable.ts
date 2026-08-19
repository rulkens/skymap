import type { EarthResidentTile } from '../../@types/scene/EarthResidentTile';
import type { EarthTilePlan } from '../../@types/scene/EarthTilePlan';
import { earthTileColumns } from './earthTileColumns';

/**
 * buildEarthPageTable — windowSide×windowSide RGBA8UI page table: per cell,
 * R/G = atlas slot col/row, B = tile `z`, A = blend weight 0..255 against the
 * whole-globe base (A=0 → base only). Rebuilt whole every frame — patching
 * risks a cell naming a slot since evicted (eviction ≠ slot granularity).
 *
 * Written in increasing `z`; a tile only claims a cell whose alpha it can
 * match, so a saturated ancestor holds until a landing finer tile finishes
 * fading, instead of dipping the footprint to base. Unrequested-but-resident
 * tiles still project — coverage for ground whose finer replacement is still
 * loading.
 */
export function buildEarthPageTable(input: {
  /** Every tile currently in the atlas, in any order. */
  readonly resident: readonly EarthResidentTile[];
  readonly plan: EarthTilePlan;
  readonly slotsPerRow: number;
  readonly windowSide: number;
  readonly tilePx: number;
}): Uint8Array {
  const { resident, plan, slotsPerRow, windowSide, tilePx } = input;

  const table = new Uint8Array(windowSide * windowSide * 4);
  const cols = earthTileColumns(plan.zWin, tilePx);

  // Sorted by level, the increasing-z property above.
  const entries = resident.filter((entry) => {
    // Finer than the window's own level covers less than a cell.
    return entry.tile.z <= plan.zWin;
  });
  entries.sort((a, b) => a.tile.z - b.tile.z);

  for (const entry of entries) {
    // A tile at level `z` covers `span` cells each way at the window's level.
    const span = 1 << (plan.zWin - entry.tile.z);
    const x0 = entry.tile.x * span;
    const y0 = entry.tile.y * span;

    // Latitude isn't periodic, so this range is clipped once, up front.
    const jStart = Math.max(0, plan.winY0 - y0);
    const jEnd = Math.min(span, plan.winY0 + windowSide - y0);
    if (jEnd <= jStart) continue;

    const col = entry.slot % slotsPerRow;
    const row = Math.floor(entry.slot / slotsPerRow);
    // Clamped rather than trusted: `Uint8Array` wraps a negative assignment
    // to 255, which would read as "fully opaque" — the worst possible
    // misreading of "not visible yet".
    const alpha = Math.max(0, Math.min(255, Math.round(entry.weight * 255)));

    for (let j = jStart; j < jEnd; j++) {
      const rowBase = (y0 + j - plan.winY0) * windowSide;
      for (let i = 0; i < span; i++) {
        // Longitude IS periodic; per-column since a tile can enter the window
        // in two runs across the antimeridian.
        const dx = (((x0 + i - plan.winX0) % cols) + cols) % cols;
        if (dx >= windowSide) continue;
        const at = (rowBase + dx) * 4;
        if (alpha < table[at + 3]!) continue;
        table[at] = col;
        table[at + 1] = row;
        table[at + 2] = entry.tile.z;
        table[at + 3] = alpha;
      }
    }
  }

  return table;
}
