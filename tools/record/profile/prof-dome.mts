// @ts-nocheck — throwaway measurement script, see README.md here
// dome recorder stage profiler (scratch, see README.md here)
const BASE = process.env.URL ?? 'http://localhost:5173';
import { launchChromium } from '../../utils/browser/launchChromium';
import { spawn } from 'node:child_process';
import { bootHookedPage } from '../../utils/browser/bootHookedPage';
import { grantAndAwaitExpiry } from '../grantAndAwaitExpiry';
import { buildFfmpegArgs } from '../../utils/record/buildFfmpegArgs';

const size = Number(process.env.SIZE ?? 1024),
  frames = Number(process.env.FRAMES ?? 10),
  fps = 30;
const dome = process.env.DOME !== '0';
const browser = await launchChromium();
const ctx = await browser.newContext({
  viewport: { width: size, height: size },
  deviceScaleFactor: 1,
});
await ctx.addInitScript(() => {
  const w = window as any;
  w.__prof = { raf: 0, submits: 0 };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      w.__prof.raf++;
      cb(t);
    });
  const sub = GPUQueue.prototype.submit;
  GPUQueue.prototype.submit = function (b) {
    w.__prof.submits++;
    return sub.call(this, b);
  };
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.warn('[page]', e.message));
const t0 = Date.now();
page.setDefaultNavigationTimeout(300000);
await bootHookedPage(
  page,
  `${BASE}/?cinema${dome ? '&dome' : ''}#t=2026-07-31T12:00:00.000Z`,
  '__skymapRecorder',
);
console.log(`boot ${Date.now() - t0} ms`);
const session = await ctx.newCDPSession(page);
await session.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
await page.evaluate(() => {
  (window as any).__skymapRecorder.startClip('earthUniverseLoop');
});
const ff = process.env.NOENC
  ? ({
      stdin: { end() {} },
      on(_e: string, r: () => void) {
        r();
      },
    } as any)
  : spawn(
      'ffmpeg',
      buildFfmpegArgs({ fps, out: `recordings/profile-out-${size}.mp4`, dome: true }),
      { stdio: ['pipe', 'ignore', 'ignore'] },
    );
const T: Record<string, number[]> = {
  poll: [],
  grant: [],
  capture: [],
  decode: [],
  write: [],
  rafPerGrant: [],
  submitsPerGrant: [],
  jpegMB: [],
};
const now = () => performance.now();
for (let f = 0; f < frames; f++) {
  let t = now();
  const before = await page.evaluate(() => ({ ...(window as any).__prof }));
  T.poll.push(now() - t);
  t = now();
  await grantAndAwaitExpiry(session, 1000 / fps, `f${f}`);
  T.grant.push(now() - t);
  const after = await page.evaluate(() => ({ ...(window as any).__prof }));
  T.rafPerGrant.push(after.raf - before.raf);
  T.submitsPerGrant.push(after.submits - before.submits);
  t = now();
  const shot = await session.send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 100,
    fromSurface: true,
    clip: { x: 0, y: 0, width: size, height: size, scale: 1 },
  });
  T.capture.push(now() - t);
  t = now();
  const buf = Buffer.from(shot.data, 'base64');
  T.decode.push(now() - t);
  T.jpegMB.push(buf.length / 1e6);
  t = now();
  if (!process.env.NOENC)
    await new Promise<void>((r, j) => ff.stdin!.write(buf, (e) => (e ? j(e) : r())));
  T.write.push(now() - t);
  console.log(
    `f${f} grant ${T.grant.at(-1)!.toFixed(0)}ms raf ${T.rafPerGrant.at(-1)} submits ${T.submitsPerGrant.at(-1)} capture ${T.capture.at(-1)!.toFixed(0)}ms`,
  );
}
const tEnc = now();
ff.stdin!.end();
await new Promise((r) => ff.on('close', r));
const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
for (const [k, v] of Object.entries(T))
  console.log(
    k.padEnd(16),
    'median',
    med(v.slice(2)).toFixed(1),
    ' all',
    v.map((x) => x.toFixed(0)).join(' '),
  );
console.log('ffmpeg drain after last write', (now() - tEnc).toFixed(0), 'ms');
await browser.close();
