/**
 * macOS names the menu bar, the Dock and the firewall prompt after the running bundle, so a dev run of
 * the stock Electron.app says "Electron". This keeps a copy renamed Skymap (with the brand icon when
 * `npm run brand` has made one), re-signed ad hoc because the edited Info.plist breaks the original
 * signature. It is rebuilt only when Electron's version changes, so the firewall asks once per version.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function brandedElectronApp(
  stockBinary: string,
  version: string,
  cacheDir: string,
  icns: string,
): string {
  const app = join(cacheDir, 'Skymap.app');
  const binary = join(app, 'Contents/MacOS/Electron');
  const stamp = join(cacheDir, 'version');
  if (existsSync(binary) && existsSync(stamp) && readFileSync(stamp, 'utf8') === version)
    return binary;

  rmSync(cacheDir, { recursive: true, force: true });
  mkdirSync(cacheDir, { recursive: true });
  execFileSync('ditto', [join(dirname(stockBinary), '../..'), app]);
  const plist = join(app, 'Contents/Info.plist');
  for (const key of ['CFBundleName', 'CFBundleDisplayName'])
    execFileSync('plutil', ['-replace', key, '-string', 'Skymap', plist]);
  if (existsSync(icns)) copyFileSync(icns, join(app, 'Contents/Resources/electron.icns'));
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app]);
  writeFileSync(stamp, version);
  return binary;
}
