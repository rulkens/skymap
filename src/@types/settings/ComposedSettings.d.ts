/**
 * ComposedSettings — the seeded settings root: the core clusters plus one
 * cluster per Layer settings fragment. `Core` stays a parameter because the
 * core/Layer cut is drawn later in this plan.
 */

import type { ComposedClusters } from './ComposedClusters';
import type { SettingsFragmentLike } from './SettingsFragmentLike';

export type ComposedSettings<Core, Fragments extends readonly SettingsFragmentLike[]> = Core &
  ComposedClusters<Fragments>;
