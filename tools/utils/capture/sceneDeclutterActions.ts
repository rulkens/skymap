/**
 * Scene content a FOCUS shot strips, because its subject is one object and
 * everything else is backdrop: structure rings, orbit trails, and — for a card
 * that asks — the survey point clouds. A view shot must NOT run these: a
 * view's subject IS the scene, and its own settings say what belongs in it
 * (the Solar System view's trails are the picture, not clutter over it).
 */

import type { UnknownAction } from '@reduxjs/toolkit';
import { GALAXY_CATALOG_IDS } from '../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { STRUCTURE_IDS } from '../../../src/data/structure/structureIds';
import { setGalaxyCatalogVisible } from '../../../src/layers/galaxyCatalog/state/galaxyCatalogs/slice';
import { setStructureItemEnabled } from '../../../src/layers/structure/state/structures/slice';
import { setOrbitTrailsEnabled } from '../../../src/state/settings/core/orbitTrails/slice';
import type { GalaxyCatalogId } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalogId';

const FAMOUS_GALAXY_CATALOG: GalaxyCatalogId = 'famousGalaxy';

export function sceneDeclutterActions(hideGalaxyField: boolean): UnknownAction[] {
  return [
    // `famousGalaxy` is a catalog row like the surveys, but it draws the
    // subject of a galaxy card — hiding "the field" must never hide it.
    ...(hideGalaxyField
      ? GALAXY_CATALOG_IDS.filter((id) => id !== FAMOUS_GALAXY_CATALOG).map((id) =>
          setGalaxyCatalogVisible({ id, enabled: false }),
        )
      : []),
    ...STRUCTURE_IDS.map((id) => setStructureItemEnabled({ id, enabled: false })),
    setOrbitTrailsEnabled(false),
  ];
}
