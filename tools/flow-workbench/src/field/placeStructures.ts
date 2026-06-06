/**
 * placeStructures — map a whole catalog into the renderer's world cube.
 *
 * Thin convenience over `structureWorld`: the LabelsOverlay wants the catalog
 * pre-placed once (positions don't change with the camera; only their screen
 * projection does), so this runs every entry through the verified mapping and
 * carries the name along. Kept separate from `structureWorld` so the single-
 * point map stays independently testable.
 */
import type { CatalogStructure } from '../../@types/field/CatalogStructure';
import type { PlacedStructure } from '../../@types/field/PlacedStructure';
import { structureWorld } from './structureWorld';

export function placeStructures(
  catalog: readonly CatalogStructure[],
): readonly PlacedStructure[] {
  return catalog.map((s) => ({
    name: s.name,
    world: structureWorld(s.raDeg, s.decDeg, s.distMpc),
  }));
}
