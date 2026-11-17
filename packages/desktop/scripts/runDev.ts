/** `npm run dev`: the built app in a window, under the name Skymap on macOS (see brandedElectronApp). */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { brandedElectronApp } from './utils/brandedElectronApp';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const stock: string = require('electron');
const binary =
  process.platform === 'darwin'
    ? brandedElectronApp(
        stock,
        require('electron/package.json').version,
        join(root, '../../node_modules/.cache/skymap-desktop-dev'),
        join(root, 'resources/icon.icns'),
      )
    : stock;

const child = spawn(binary, [root, '--windowed', ...process.argv.slice(2)], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
