import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { APP_SERVER_PORT } from '../src/data/appServerPort';

const root = join(import.meta.dirname, '..');
const config = parse(readFileSync(join(root, 'electron-builder.yml'), 'utf8'));
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
// electron-builder's own macros, filled as it fills them.
const expand = (name: string, ext: string) =>
  name
    .replace('${productName}', config.productName)
    .replace('${version}', version)
    .replace('${ext}', ext);

describe('electron-builder.yml', () => {
  it('names the installers Skymap-<package.json version>-mac.dmg and -win-setup.exe', () => {
    expect(expand(config.dmg.artifactName, 'dmg')).toBe(`Skymap-${version}-mac.dmg`);
    expect(expand(config.nsis.artifactName, 'exe')).toBe(`Skymap-${version}-win-setup.exe`);
  });

  it('keeps the Windows installer per machine, with its firewall rule on the app port', () => {
    expect(config.nsis).toMatchObject({ oneClick: false, perMachine: true });
    expect(readFileSync(join(root, config.nsis.include), 'utf8')).toContain(
      `localport=${APP_SERVER_PORT} profile=private,domain`,
    );
  });
});
