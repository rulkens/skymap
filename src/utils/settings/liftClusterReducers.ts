import type { LiftedCaseReducers } from '../../@types/settings/LiftedCaseReducers';
import type { SettingsFragmentLike } from '../../@types/settings/SettingsFragmentLike';

/** Re-bases one fragment's case reducers from its cluster onto the settings root. */
export function liftClusterReducers<Root, F extends SettingsFragmentLike>(
  fragment: F,
): LiftedCaseReducers<Root, F> {
  const lifted: Record<string, (state: unknown, action: unknown) => void> = {};

  for (const [name, reducer] of Object.entries(fragment.reducers)) {
    // `SliceCaseReducers` also admits RTK's `{ reducer, prepare }` objects, which have no
    // single cluster-scoped function to re-base.
    if (typeof reducer !== 'function') {
      throw new Error(
        `liftClusterReducers: "${fragment.key}" reducer "${name}" uses the { reducer, prepare } form, which settings fragments do not support`,
      );
    }
    const write = reducer as (cluster: unknown, action: unknown) => unknown;

    lifted[name] = (state, action) => {
      // Cluster resolved per dispatch off the live root draft; a copy is undrafted and Immer
      // drops the write. A RETURNED replacement (RTK allows it) must be written back.
      const root = state as Record<string, unknown>;
      const next = write(root[fragment.key], action);
      if (next !== undefined) root[fragment.key] = next;
    };
  }

  return lifted as LiftedCaseReducers<Root, F>;
}
