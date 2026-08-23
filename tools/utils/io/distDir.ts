/**
 * distDir — absolute path of the production build output root (`dist/`).
 * Shared by the root vite config and the tool configs (galaxy-renderer,
 * mcpm-workbench) that build into subpaths of it, so the deploy layout
 * (docs/DEPLOY.md) is spelled in exactly one place.
 */
import { resolve } from 'node:path';

export const distDir = resolve(__dirname, '../../../dist');
