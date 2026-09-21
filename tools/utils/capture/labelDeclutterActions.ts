/**
 * Every label off, plus the selection chrome, as per-row actions rather than a
 * settings snapshot so the tool states exactly what it hides. Applies to EVERY
 * shot: no card's thumbnail wants text burned into it. Its sibling
 * `sceneDeclutterActions` hides scene content, which only a focus shot wants.
 */

import type { UnknownAction } from '@reduxjs/toolkit';
import { GALAXY_CATALOG_IDS } from '../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { STAR_CATALOG_IDS } from '../../../src/data/starCatalog/starCatalogIds';
import { STRUCTURE_IDS } from '../../../src/data/structure/structureIds';
import { BODY_IDS } from '../../../src/data/bodies/bodyIds';
import { setGalaxyCatalogLabelEnabled } from '../../../src/layers/galaxyCatalog/state/galaxyCatalogs/slice';
import { setStarCatalogLabelEnabled } from '../../../src/layers/starCatalog/state/starCatalogs/slice';
import { setStructureLabelEnabled } from '../../../src/layers/structure/state/structures/slice';
import { setBodyLabelEnabled } from '../../../src/layers/body/state/bodies/slice';
import { setMilkyWayLabelEnabled } from '../../../src/layers/milkyWay/state/milkyWay/slice';
import { setPassDisabled } from '../../../src/state/settings/core/debugSlice';
import { CAPTURE_HIDDEN_PASSES } from './hiddenPasses';

export function labelDeclutterActions(): UnknownAction[] {
  return [
    ...GALAXY_CATALOG_IDS.map((id) => setGalaxyCatalogLabelEnabled({ id, enabled: false })),
    ...STAR_CATALOG_IDS.map((id) => setStarCatalogLabelEnabled({ id, enabled: false })),
    ...STRUCTURE_IDS.map((id) => setStructureLabelEnabled({ id, enabled: false })),
    ...BODY_IDS.map((id) => setBodyLabelEnabled({ id, enabled: false })),
    setMilkyWayLabelEnabled(false),
    ...CAPTURE_HIDDEN_PASSES.map((pass) => setPassDisabled({ pass, disabled: true })),
  ];
}
