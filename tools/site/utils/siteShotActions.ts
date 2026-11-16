import type { UnknownAction } from '@reduxjs/toolkit';

import type { SiteShot } from '../../../packages/website/src/@types/SiteShot';
import { BiasMode } from '../../../src/data/galaxyCatalog/biasMode';
import { setBiasMode } from '../../../src/layers/galaxyCatalog/state/bias/slice';
import { setAutoRotate, setFovYRad } from '../../../src/state/camera/cameraIntentSlice';
import { degToRad } from '../../../src/utils/math/degToRad';
import { setExposure } from '../../../src/state/settings/core/tonemapSlice';
import { setMeshAmbient, setPassDisabled } from '../../../src/state/settings/core/debugSlice';
import { requestTier } from '../../../src/state/tier/requestTier';
import { startTour } from '../../../src/state/tour/tourActions';
import { CURRENT_SPLASH_VERSION } from '../../../src/state/ui/splashStorage';
import { dismissSplash, setDebugPanelOpen } from '../../../src/state/ui/uiSlice';
import { linkIntentFrom } from '../../../src/utils/url/linkIntentFrom';
import { APP_TOUR_REGISTRY } from '../../../src/compositions/appTours';
import { CAPTURE_HIDDEN_PASSES } from '../../utils/capture/hiddenPasses';

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
  if (settings.fovDeg !== undefined) actions.push(setFovYRad(degToRad(settings.fovDeg)));
  if (settings.exposure !== undefined) actions.push(setExposure(settings.exposure));
  if (settings.ambient !== undefined) actions.push(setMeshAmbient(settings.ambient));
  if (settings.rawDensity) actions.push(setBiasMode(BiasMode.None));
  // The new size's files load after this; the row's `settleMs` is the wait for them.
  if (settings.dataSize !== undefined) actions.push(requestTier(settings.dataSize));
  if (settings.hideLabels) {
    actions.push(...CAPTURE_HIDDEN_PASSES.map((pass) => setPassDisabled({ pass, disabled: true })));
  }
  // A matte row's passes are left out by shootMatte, after the shadow pair that needs the ground they hide.
  if (settings.hidePasses && !settings.matte) {
    actions.push(...settings.hidePasses.map((pass) => setPassDisabled({ pass, disabled: true })));
  }
  if (settings.debugPanel) actions.push(setDebugPanelOpen(true));
  if (settings.tourStep !== undefined) {
    const { view } = linkIntentFrom(link);
    if (view.kind !== 'tour' || !(view.id in APP_TOUR_REGISTRY)) {
      throw new Error(`tourStep needs a link to a registered tour, got "${link}"`);
    }
    // The runner boots a tour step on its `layers` alone, which a visitor's first visit covers with the welcome screen.
    // Last: the tour restores and rewrites settings itself, so it must own the scene from here.
    actions.push(
      dismissSplash(CURRENT_SPLASH_VERSION),
      startTour(view.id as keyof typeof APP_TOUR_REGISTRY, {
        from: settings.tourStep,
        to: settings.tourStep,
      }),
    );
  }
  return actions;
}
