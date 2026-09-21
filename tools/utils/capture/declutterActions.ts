import type { UnknownAction } from '@reduxjs/toolkit';
import { GALAXY_CATALOG_IDS } from '../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { STAR_CATALOG_IDS } from '../../../src/data/starCatalog/starCatalogIds';
import { STRUCTURE_IDS } from '../../../src/data/structure/structureIds';
import { BODY_IDS } from '../../../src/data/bodies/bodyIds';
import {
  setGalaxyCatalogLabelEnabled,
  setGalaxyCatalogVisible,
} from '../../../src/layers/galaxyCatalog/state/galaxyCatalogs/slice';
import { setStarCatalogLabelEnabled } from '../../../src/layers/starCatalog/state/starCatalogs/slice';
import {
  setStructureItemEnabled,
  setStructureLabelEnabled,
} from '../../../src/layers/structure/state/structures/slice';
import { setBodyLabelEnabled } from '../../../src/layers/body/state/bodies/slice';
import { setMilkyWayLabelEnabled } from '../../../src/layers/milkyWay/state/milkyWay/slice';
import { setOrbitTrailsEnabled } from '../../../src/layers/body/state/orbitTrails/slice';
import type { GalaxyCatalogId } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalogId';
import { setPassDisabled } from '../../../src/state/settings/core/debugSlice';
import { CAPTURE_HIDDEN_PASSES } from './hiddenPasses';

const FAMOUS_GALAXY_CATALOG: GalaxyCatalogId = 'famousGalaxy';

/**
 * Every label off, structure rings and orbit trails off, and — for a card that
 * asks — the survey point clouds off, as per-row actions rather than a settings
 * snapshot, so the tool states exactly what it hides.
 */
export function declutterActions(hideGalaxyField: boolean): UnknownAction[] {
  return [
    ...GALAXY_CATALOG_IDS.flatMap((id) => [
      setGalaxyCatalogLabelEnabled({ id, enabled: false }),
      // `famousGalaxy` is a catalog row like the surveys, but it draws the
      // subject of a galaxy card — hiding "the field" must never hide it.
      ...(hideGalaxyField && id !== FAMOUS_GALAXY_CATALOG
        ? [setGalaxyCatalogVisible({ id, enabled: false })]
        : []),
    ]),
    ...STAR_CATALOG_IDS.map((id) => setStarCatalogLabelEnabled({ id, enabled: false })),
    ...STRUCTURE_IDS.flatMap((id) => [
      setStructureLabelEnabled({ id, enabled: false }),
      setStructureItemEnabled({ id, enabled: false }),
    ]),
    ...BODY_IDS.map((id) => setBodyLabelEnabled({ id, enabled: false })),
    setMilkyWayLabelEnabled(false),
    setOrbitTrailsEnabled(false),
    ...CAPTURE_HIDDEN_PASSES.map((pass) => setPassDisabled({ pass, disabled: true })),
  ];
}
