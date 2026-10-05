/**
 * PROJECT_ROOT — absolute path of the checkout a tool runs from, for comparing
 * against the root the served app reports (`window.__skymap.projectRoot`).
 */
import { resolve } from 'node:path';

export const PROJECT_ROOT = resolve(import.meta.dirname, '../../..');
