import type { ComposedSettings } from '../../@types/settings/ComposedSettings';
import type { SettingsFragmentLike } from '../../@types/settings/SettingsFragmentLike';

/**
 * Seeds the settings root from the core clusters plus one cluster per Layer
 * settings fragment.
 *
 * The throw is the guard the type system cannot give: a colliding key makes
 * `Core & ComposedClusters<…>` silently NARROW to the two cluster shapes'
 * intersection instead of erroring, and the seed carries whichever ran last.
 */
export function composeSettingsSeed<
  Core extends object,
  const Fragments extends readonly SettingsFragmentLike[],
>(core: Core, fragments: Fragments): ComposedSettings<Core, Fragments> {
  const seeded = { ...core } as Record<string, unknown>;

  for (const fragment of fragments) {
    if (Object.hasOwn(seeded, fragment.key)) {
      throw new Error(`composeSettingsSeed: settings cluster "${fragment.key}" is claimed twice`);
    }
    seeded[fragment.key] = fragment.seed();
  }

  return seeded as ComposedSettings<Core, Fragments>;
}
