import type { GroupRegistry } from '../../scene-workbench/@types/GroupRegistry';
import type { GroupRegistryEntry } from '../../scene-workbench/@types/GroupRegistryEntry';

/** Replaces the entry sharing `entry.id` in place, or appends it. Mirrors
 *  `upsertAsset`'s identity-preserving behaviour for `scenes.json`'s rows. */
export function upsertGroup(registry: GroupRegistry, entry: GroupRegistryEntry): GroupRegistry {
  const index = registry.groups.findIndex((existing) => existing.id === entry.id);
  const groups =
    index === -1
      ? [...registry.groups, entry]
      : registry.groups.map((existing, i) => (i === index ? entry : existing));

  return { ...registry, groups };
}
