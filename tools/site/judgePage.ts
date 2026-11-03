/**
 * Judge the pictures of one page of the running website: the section shots of `site:sections`, then
 * a picture report (`report.md`, `report.json`) on every site shot and film in `<main>`: the file the
 * browser chose against the width its box needs, what `object-fit: cover` cuts away, its brightness
 * as displayed, its alt text. A contact sheet per width (`contact-<width>.png`) shows every picture
 * as displayed, labelled, in page order, to compare framing and light across neighbours.
 *
 *   npm run site:judge -- /features/ [--url http://localhost:5800] [--widths 1440,1024,400] [--dpr 2] [--label judge] [--out <dir>]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';
import sharp from 'sharp';

import { BASE } from '../../packages/website/src/data/site';
import { SITE_SHOTS } from '../../packages/website/src/data/siteShots';
import { launchChromium } from '../utils/browser/launchChromium';
import type { PictureJudgement } from './@types/PictureJudgement';
import type { PictureReport } from './@types/PictureReport';
import { brightnessFlags } from './utils/brightnessFlags';
import { displayedCrop } from './utils/displayedCrop';
import { judgePicture } from './utils/judgePicture';
import { lumaStats } from './utils/lumaStats';
import { makeContactSheet } from './utils/makeContactSheet';
import { measurePictures } from './utils/measurePictures';
import { openScrolledSitePage } from './utils/openScrolledSitePage';
import { pictureReportMarkdown } from './utils/pictureReportMarkdown';
import { sectionAt } from './utils/sectionAt';
import { shootPageSections } from './utils/shootPageSections';
import { shotOfSrc } from './utils/shotOfSrc';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: 'string', default: 'http://localhost:5800' },
    widths: { type: 'string', default: '1440,1024,400' },
    dpr: { type: 'string', default: '2' },
    label: { type: 'string', default: 'judge' },
    out: { type: 'string' },
  },
});
const path = positionals[0];
if (!path) throw new Error('Give the page path, such as /features/');
const out =
  values.out ?? join(tmpdir(), 'site-judge', path.replace(/\W+/g, '-').replace(/^-|-$/g, ''));
const dpr = Number(values.dpr);
mkdirSync(out, { recursive: true });

const url = `${values.url}${BASE.replace(/\/$/, '')}${path}`;
const report: PictureReport = { page: path, url, dpr, widths: [] };
const browser = await launchChromium();
try {
  for (const width of values.widths.split(',').map(Number)) {
    const page = await openScrolledSitePage(browser, url, width, dpr);
    const sections = await shootPageSections(page, out, `${values.label}-${width}`);
    const pictures: PictureJudgement[] = [];
    const notShown: string[] = [];
    const tiles = [];
    const measures = (await measurePictures(page)).sort(
      (a, b) => a.box.y - b.box.y || a.box.x - b.box.x,
    );
    for (const m of measures) {
      const row =
        m.kind === 'img' ? SITE_SHOTS.find((s) => s.id === shotOfSrc(m.src)?.id) : undefined;
      if (m.kind === 'img' && !row) continue;
      if (!m.shown) {
        notShown.push(row?.id ?? (m.src.split('/').pop() || `a ${m.kind}`));
        continue;
      }
      const section = sectionAt(sections, m.box.y, m.box.y + m.box.height);
      const p = judgePicture(m, section, dpr, row ?? null);
      const { png, hidden } = await displayedCrop(page, m, dpr);
      const grey = await sharp(png).removeAlpha().toColourspace('b-w').raw().toBuffer();
      p.hiddenNow = hidden;
      p.luma = lumaStats(new Uint8Array(grey));
      p.flags.push(...brightnessFlags(p.luma));
      pictures.push(p);
      const short = p.flags.map((flag) => flag.split(':')[0]);
      tiles.push({
        png,
        title: `#${p.index} ${p.shotId ?? p.file} · ${p.box.width}x${p.box.height}${hidden ? ' · hidden slide' : ''}`,
        note: [
          short.join(' · ') || 'ok',
          `crop ${Math.round((p.croppedShare ?? 0) * 100)}%`,
          `p95 ${p.luma.p95.toFixed(2)}`,
        ].join(' · '),
        alarm: short.length > 0,
      });
    }
    const contactSheet = join(out, `contact-${width}.png`);
    await makeContactSheet(tiles, contactSheet);
    await page.close();
    report.widths.push({
      width,
      contactSheet,
      sections: sections.map((s) => s.text.trim()),
      pictures,
      notShown,
    });
    const flagged = pictures.filter((p) => p.flags.length > 0).length;
    console.log(`${width}: ${pictures.length} pictures, ${flagged} flagged → ${contactSheet}`);
  }
} finally {
  await browser.close();
}
writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(out, 'report.md'), pictureReportMarkdown(report));
console.log(`report: ${join(out, 'report.md')}`);
