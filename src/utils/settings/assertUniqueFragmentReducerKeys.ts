import type { SettingsFragmentLike } from '../../@types/settings/SettingsFragmentLike';

/**
 * Throws if two settings fragments declare the same reducer key, or if a fragment claims a
 * key already `reserved` (the core reducer namespace).
 *
 * Reducer keys share one flat namespace (so action type strings stay byte-identical) and
 * nothing in the language guards it: two spreads sharing a key are not a TS error — the
 * later silently wins, and `createSlice` mints one action that writes the other cluster.
 */
export function assertUniqueFragmentReducerKeys(
  fragments: readonly SettingsFragmentLike[],
  reserved: readonly string[] = [],
): void {
  const claimedBy = new Map<string, string>(reserved.map((name) => [name, 'core']));

  for (const fragment of fragments) {
    for (const name of Object.keys(fragment.reducers)) {
      const prior = claimedBy.get(name);
      if (prior !== undefined) {
        throw new Error(
          prior === 'core'
            ? `assertUniqueFragmentReducerKeys: reducer "${name}" collides with a core reducer key`
            : `assertUniqueFragmentReducerKeys: reducer "${name}" is declared by both the "${prior}" and "${fragment.key}" settings clusters`,
        );
      }
      claimedBy.set(name, fragment.key);
    }
  }
}
