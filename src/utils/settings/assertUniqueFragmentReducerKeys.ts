import type { SettingsFragmentLike } from '../../@types/settings/SettingsFragmentLike';

/**
 * Throws if two settings fragments declare the same reducer key.
 *
 * Reducer keys share one flat namespace (so action type strings stay
 * byte-identical) and nothing in the language guards it: two object spreads
 * sharing a key are not a TS error — the later silently wins, and `createSlice`
 * mints one action whose reducer writes the other cluster.
 */
export function assertUniqueFragmentReducerKeys(fragments: readonly SettingsFragmentLike[]): void {
  const claimedBy = new Map<string, string>();

  for (const fragment of fragments) {
    for (const name of Object.keys(fragment.reducers)) {
      const prior = claimedBy.get(name);
      if (prior !== undefined) {
        throw new Error(
          `assertUniqueFragmentReducerKeys: reducer "${name}" is declared by both the "${prior}" and "${fragment.key}" settings clusters`,
        );
      }
      claimedBy.set(name, fragment.key);
    }
  }
}
