/**
 * Renders the desktop app's brand bitmaps from the brand page (src/brand) in headless Chromium: the
 * icon sets, the dmg's volume icon and background at 1x and 2x and the Windows installer bitmaps,
 * into resources/, where electron-builder looks. `npm run dist` runs it first and the outputs are not
 * committed, so a new mark or wordmark is a source change and never a stale binary.
 */
import { chromium } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { build } from 'vite';
import type { MarkDrawing } from '../../website/src/@types/MarkDrawing';
import type { BrandAsset } from '../src/brand/@types/BrandAsset';
import { ICNS_SLOTS } from './data/icnsSlots';
import { encodeBmp } from './utils/encodeBmp';
import { encodeIcns } from './utils/encodeIcns';
import { encodeIco } from './utils/encodeIco';

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
// At 32 px and under the large drawing's walls thin below a pixel, so those slots get the small one.
const SMALL_DRAWING_MAX_PX = 32;
const root = resolve(import.meta.dirname, '..');
const out = join(root, 'resources');
const pageDir = await mkdtemp(join(tmpdir(), 'skymap-brand-'));

async function shoot(
  browser: Browser,
  asset: BrandAsset,
  width: number,
  height: number,
  scale = 1,
  drawing: MarkDrawing = 'large',
): Promise<Buffer> {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: scale,
    reducedMotion: 'reduce',
  });
  await page.goto(
    `${pathToFileURL(join(pageDir, 'index.html')).href}?asset=${asset}&drawing=${drawing}`,
  );
  await page.waitForFunction(() => document.querySelector('#root > *') !== null);
  // The star field redraws round the words once the faces load; two frames let that land.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode()));
    for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
  });
  await page.waitForFunction(() => !document.querySelector('canvas:not([data-shown])'));
  const png = await page.screenshot({ omitBackground: asset.startsWith('icon') });
  await page.close();
  return png;
}

async function toBmp(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return encodeBmp(data, info.width, info.height);
}

async function iconSet(browser: Browser, asset: BrandAsset, sizes: readonly number[]) {
  const pngs = new Map<number, Buffer>();
  for (const size of new Set(sizes)) {
    const drawing = size <= SMALL_DRAWING_MAX_PX ? 'small' : 'large';
    pngs.set(size, await shoot(browser, asset, size, size, 1, drawing));
  }
  return pngs;
}

await build({
  configFile: join(root, 'vite.config.ts'),
  mode: 'brand',
  logLevel: 'warn',
  build: { outDir: pageDir, emptyOutDir: true },
});
const browser = await chromium.launch();
try {
  const mac = await iconSet(
    browser,
    'icon-mac',
    ICNS_SLOTS.map(([, size]) => size),
  );
  const win = await iconSet(browser, 'icon-win', ICO_SIZES);
  const volume = await iconSet(
    browser,
    'icon-volume',
    ICNS_SLOTS.map(([, size]) => size),
  );
  const files: Record<string, Buffer> = {
    'icon.icns': encodeIcns(mac),
    'icon.ico': encodeIco(win),
    'icon.png': mac.get(1024)!,
    'volume.icns': encodeIcns(volume),
    'background.png': await shoot(browser, 'dmg', 660, 400),
    'background@2x.png': await shoot(browser, 'dmg', 660, 400, 2),
    'installerHeader.bmp': await toBmp(await shoot(browser, 'nsis-header', 150, 57)),
    'installerSidebar.bmp': await toBmp(await shoot(browser, 'nsis-sidebar', 164, 314)),
  };
  await mkdir(out, { recursive: true });
  for (const [name, bytes] of Object.entries(files)) await writeFile(join(out, name), bytes);
  console.log(`brand assets → ${out}: ${Object.keys(files).join(', ')}`);
} finally {
  await browser.close();
  await rm(pageDir, { recursive: true, force: true });
}
