/**
 * The store values that survive a reload, one row each. `main.tsx` installs
 * the writer over `PERSISTED_VALUES`; boot-time seeding reads a row directly.
 */
import type { PersistedValue } from '../@types/state/PersistedValue';
import { selectSplashDismissedVersion } from './ui/selectors';

export const SPLASH_SEEN_VERSION: PersistedValue<number | null> = {
  key: 'skymap.splash.seenVersion',
  select: selectSplashDismissedVersion,
  parse: (raw) => {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  },
  serialize: (v) => String(v),
};

export const PERSISTED_VALUES = [SPLASH_SEEN_VERSION] as const;
