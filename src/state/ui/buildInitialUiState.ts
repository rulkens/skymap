/**
 * buildInitialUiState — seeds the Redux ui slice with the correct splash
 * visibility and dismissed-version at store construction time.
 *
 * ### Why lift the decision here
 *
 * useSplash previously computed splash visibility inside a lazy useState
 * initializer — logic that ran once per React render pass, deep inside the
 * hooks layer. That placement made the decision invisible to the store and
 * meant the Redux slice always started with `visible: false` regardless of
 * what the URL or localStorage said.
 *
 * Moving the three-gate decision here lets the store start in the correct
 * state so that any reader (future tour effects, server-side render, test
 * fixtures) sees the right splash flag without waiting for React to mount.
 * useSplash reads the Redux slice going forward, which is the correct
 * hooks → state direction.
 */

import type { UiState } from '../../@types/ui/UiState';
import { hasDeepLink } from '../../utils/url/hasDeepLink';
import { CURRENT_SPLASH_VERSION, readSeenVersion, readUrlAtMount } from './splashStorage';

/**
 * Compute the initial UiState.  Called once at store construction.
 *
 * Splash visibility gates (applied in order):
 *   1. Deep link present (#focus= or ?tour=) → hide; user has specific intent.
 *   2. seenVersion stored and >= CURRENT_SPLASH_VERSION → hide; returning user.
 *   3. Otherwise → show; first visit or version-bumped content.
 */
export function buildInitialUiState(): UiState {
  const { hash, search } = readUrlAtMount();
  const seen = readSeenVersion();

  let splashVisible: boolean;
  if (hasDeepLink({ hash, search })) {
    splashVisible = false;
  } else if (seen !== null && seen >= CURRENT_SPLASH_VERSION) {
    splashVisible = false;
  } else {
    splashVisible = true;
  }

  return {
    paletteOpen: false,
    uiHidden: false,
    debugPanelOpen: false,
    splash: {
      visible: splashVisible,
      dismissedVersion: seen,
    },
  };
}
