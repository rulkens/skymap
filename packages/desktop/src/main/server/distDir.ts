import { app } from 'electron';
import { join, resolve } from 'node:path';

/** The web build: shipped beside the app as an extra resource, or the repo's dist/ in development. */
export function distDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'dist')
    : resolve(app.getAppPath(), '../../dist');
}
