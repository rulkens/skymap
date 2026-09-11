import type { LiftedCaseReducers } from '../../@types/settings/LiftedCaseReducers';
import type { SettingsFragmentLike } from '../../@types/settings/SettingsFragmentLike';

/**
 * Re-bases one fragment's case reducers from its cluster onto the settings root,
 * so they can be spread straight into `createSlice`.
 *
 * The cluster is resolved per dispatch, off the live root draft — projecting or
 * copying it anywhere else hands the reducer an undrafted object and Immer
 * silently drops the write.
 */
export function liftClusterReducers<Root, F extends SettingsFragmentLike>(
  fragment: F,
): LiftedCaseReducers<Root, F> {
  const lifted: Record<string, (state: unknown, action: unknown) => void> = {};

  for (const [name, reducer] of Object.entries(fragment.reducers)) {
    const write = reducer as (cluster: unknown, action: unknown) => void;
    lifted[name] = (state, action) => {
      write((state as Record<string, unknown>)[fragment.key], action);
    };
  }

  return lifted as LiftedCaseReducers<Root, F>;
}
