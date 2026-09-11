import type { ComposedSettings } from '../../@types/settings/ComposedSettings';
import type { SettingsFragmentLike } from '../../@types/settings/SettingsFragmentLike';

/**
 * Seeds the settings root from the core clusters plus one cluster per fragment.
 *
 * The throw is the guard the type system cannot give: a colliding key makes
 * `Core & ComposedClusters<…>` silently NARROW instead of erroring.
 */
export function composeSettingsSeed<
  Core extends object,
  const Fragments extends readonly SettingsFragmentLike[],
>(core: Core, fragments: Fragments): ComposedSettings<Core, Fragments> {
  const seeded = { ...core } as Record<string, unknown>;
  const coreKeys = new Set(Object.keys(seeded));

  for (const fragment of fragments) {
    if (Object.hasOwn(seeded, fragment.key)) {
      throw new Error(
        coreKeys.has(fragment.key)
          ? `composeSettingsSeed: settings cluster "${fragment.key}" is claimed by a fragment and by the core seed`
          : `composeSettingsSeed: settings cluster "${fragment.key}" is claimed by two fragments`,
      );
    }
    seeded[fragment.key] = fragment.seed();
  }

  return seeded as ComposedSettings<Core, Fragments>;
}
