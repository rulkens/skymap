import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { APP_SERVER_PORT } from '../src/data/appServerPort';

const root = join(import.meta.dirname, '..');
const config = parse(readFileSync(join(root, 'electron-builder.yml'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const nsis = readFileSync(join(root, config.nsis.include), 'utf8');

describe('electron-builder.yml', () => {
  // Electron names userData from package.json alone (electron-builder does not copy its own
  // productName in), while the uninstaller's ${PRODUCT_NAME} is the yml's: unequal, its
  // "Downloaded sky data" box finds nothing and leaves gigabytes behind.
  it('deletes the sky data from the folder Electron puts it in', () => {
    expect(pkg.productName).toBe(config.productName);
    expect(nsis).toContain('"$APPDATA\\${PRODUCT_NAME}\\data"');
  });

  it('keeps the Windows installer per machine, with its firewall rule on the app port', () => {
    expect(config.nsis).toMatchObject({ oneClick: false, perMachine: true });
    expect(nsis).toContain(`localport=${APP_SERVER_PORT} profile=private,domain`);
  });
});
