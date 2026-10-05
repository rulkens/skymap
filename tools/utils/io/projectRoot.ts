/** PROJECT_ROOT — this checkout, compared against the root the served app reports. */
import { resolve } from 'node:path';

export const PROJECT_ROOT = resolve(import.meta.dirname, '../../..');
