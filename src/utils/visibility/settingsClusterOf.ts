import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import type { VisibilitySwitchCluster } from '../../@types/settings/VisibilitySwitchCluster';

/** The settings cluster an entry names by string; a name no cluster answers to throws, since
 * it can only be a wrong `cluster` in some `visibility.ts`. */
export function settingsClusterOf(
  settings: EngineSettingsState,
  cluster: string,
): VisibilitySwitchCluster {
  const found = (settings as unknown as Readonly<Record<string, VisibilitySwitchCluster>>)[cluster];
  if (found === undefined) throw new Error(`settings has no '${cluster}' cluster`);
  return found;
}
