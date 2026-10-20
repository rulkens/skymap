import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import { settingsClusterOf } from './settingsClusterOf';

/** Whether a per-item cluster also has a section switch: the one reading of the section
 * rule's premise. Data decides, so no entry has to say it. */
export function hasSectionSwitch(settings: EngineSettingsState, cluster: string): boolean {
  return typeof settingsClusterOf(settings, cluster).enabled === 'boolean';
}
