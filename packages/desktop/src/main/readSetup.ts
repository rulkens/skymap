import { join } from 'node:path';
import type { InstallSetup } from '../@types/InstallSetup';
import { SETUP_FILE } from '../data/setupFile';
import { parseInstallSetup } from '../utils/parseInstallSetup';
import { readJsonFile } from '../utils/readJsonFile';

/** <userData>/setup.json with every missing or invalid field defaulted. */
export async function readSetup(userData: string): Promise<InstallSetup> {
  return parseInstallSetup(await readJsonFile<unknown>(join(userData, SETUP_FILE)));
}
