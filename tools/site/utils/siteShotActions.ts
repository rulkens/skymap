import type { UnknownAction } from '@reduxjs/toolkit';

import type { SiteShot } from '../../../packages/website/src/@types/SiteShot';
import { GALAXY_CATALOG_IDS } from '../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { STRUCTURE_IDS } from '../../../src/data/structure/structureIds';
import { setBlackHoleLabelEnabled } from '../../../src/layers/blackHoles/state/blackHoles/slice';
import { setCosmicWebDensityEnabled } from '../../../src/layers/cosmicWebDensity/state/cosmicWebDensity/slice';
import { setCosmicWebFilamentsEnabled } from '../../../src/layers/cosmicWebFilaments/state/cosmicWebFilaments/slice';
import { setGalaxyCatalogVisible } from '../../../src/layers/galaxyCatalog/state/galaxyCatalogs/slice';
import {
  setStructureItemEnabled,
  setStructureLabelEnabled,
} from '../../../src/layers/structure/state/structures/slice';
import { setZoneOfAvoidanceEnabled } from '../../../src/layers/zoneOfAvoidance/state/zoneOfAvoidance/slice';
import { setAutoRotate } from '../../../src/state/camera/cameraSlice';
import { setFovDeg } from '../../../src/state/settings/core/cameraSettingsSlice';
import { setOrbitTrailsEnabled } from '../../../src/state/settings/core/orbitTrails/slice';
import { startTour } from '../../../src/state/tour/tourActions';
import { linkIntentFrom } from '../../../src/utils/url/linkIntentFrom';
import { tourRegistry } from '../../../src/data/animation/tours/tourRegistry';
import { labelDeclutterActions } from '../../utils/capture/labelDeclutterActions';

/**
 * The store actions a shot's `settings` stand for, in the order they are
 * dispatched. Auto-rotate is always stopped: a turning camera would make the
 * same manifest row give a different picture on every run.
 */
export function siteShotActions({
  link,
  settings = {},
}: Pick<SiteShot, 'link' | 'settings'>): UnknownAction[] {
  const actions: UnknownAction[] = [setAutoRotate({ active: false, rate: 0 })];
  if (settings.hideOrbitTrails) actions.push(setOrbitTrailsEnabled(false));
  if (settings.hideStructures) {
    actions.push(...STRUCTURE_IDS.map((id) => setStructureItemEnabled({ id, enabled: false })));
  }
  if (settings.hideStructureLabels) {
    actions.push(...STRUCTURE_IDS.map((id) => setStructureLabelEnabled({ id, enabled: false })));
  }
  if (settings.hideGalaxyField) {
    // `famousGalaxy` draws the photographs, which are the subject of a galaxy shot.
    actions.push(
      ...GALAXY_CATALOG_IDS.filter((id) => id !== 'famousGalaxy').map((id) =>
        setGalaxyCatalogVisible({ id, enabled: false }),
      ),
    );
  }
  if (settings.hideCosmicWeb) actions.push(setCosmicWebDensityEnabled(false));
  if (settings.hideZoneOfAvoidance) actions.push(setZoneOfAvoidanceEnabled(false));
  if (settings.filaments) actions.push(setCosmicWebFilamentsEnabled(true));
  if (settings.fovDeg !== undefined) actions.push(setFovDeg(settings.fovDeg));
  if (settings.hideLabels) {
    actions.push(
      ...labelDeclutterActions(),
      setBlackHoleLabelEnabled({ id: 'sgr-a-star', enabled: false }),
    );
  }
  if (settings.tourStep !== undefined) {
    const { view } = linkIntentFrom(link);
    if (view.kind !== 'tour' || !(view.id in tourRegistry)) {
      throw new Error(`tourStep needs a link to a registered tour, got "${link}"`);
    }
    // Last: the tour restores and rewrites settings itself, so it must own the scene from here.
    actions.push(
      startTour(view.id as keyof typeof tourRegistry, {
        from: settings.tourStep,
        to: settings.tourStep,
      }),
    );
  }
  return actions;
}
