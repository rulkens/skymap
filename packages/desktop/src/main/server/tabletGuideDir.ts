import { app } from 'electron';
import { join, resolve } from 'node:path';

/**
 * The tablet guide's pictures, kept once in the website's assets (owner ruling 2026-11-06): shipped
 * beside the app as an extra resource (electron-builder.yml), or read from the website in development.
 */
export function tabletGuideDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'tablet-guide')
    : resolve(app.getAppPath(), '../website/src/assets/docs/tablet-guide');
}
