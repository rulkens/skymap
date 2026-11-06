import type { InstallSetup } from '../../@types/InstallSetup';
import type { Settings } from '../settings/@types/Settings';
import { parseInstallSetup } from './utils/parseInstallSetup';

/** The stored setup with every missing or invalid field defaulted. */
export function readSetup(settings: Settings): InstallSetup {
  return parseInstallSetup(settings.get('setup') ?? null);
}
