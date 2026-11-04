import { join } from 'node:path';
import type { InstallSetup } from '../@types/InstallSetup.js';
import { SETUP_FILE } from '../data/setupFile.js';
import { parseInstallSetup } from '../utils/parseInstallSetup.js';
import { readJsonFile } from '../utils/readJsonFile.js';

/** <userData>/setup.json with every missing or invalid field defaulted. */
export async function readSetup(userData: string): Promise<InstallSetup> {
  return parseInstallSetup(await readJsonFile<unknown>(join(userData, SETUP_FILE)));
}
