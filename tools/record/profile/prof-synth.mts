// @ts-nocheck — throwaway measurement script, see README.md here
// scratch profiler: recorder capture/encode stage costs on a synthetic 4096² dome frame
import { launchChromium } from '../../utils/browser/launchChromium';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { grantAndAwaitExpiry } from '../grantAndAwaitExpiry';
import { buildFfmpegArgs } from '../../utils/record/buildFfmpegArgs';

const N = 4096,
  FRAMES = Number(process.env.FRAMES ?? 12),
  fps = 30;
const MODE = process.env.MODE ?? 'jpeg'; // jpeg | raw
const browser = await launchChromium();
const ctx = await browser.newContext({ viewport: { width: N, height: N } });
const page = await ctx.newPage();
await page.goto(new URL('./synth.html', import.meta.url).href);
await page.waitForTimeout(2000);
const session = await ctx.newCDPSession(page);
await session.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });

// raw path: page POSTs its pixels to this local server, bypassing CDP/base64/JPEG
let rawResolve: ((b: Buffer) => void) | undefined;
const server = createServer((req, res) => {
  const parts: Buffer[] = [];
  req.on('data', (d) => parts.push(d));
  req.on('end', () => {
    res.setHeader('access-control-allow-origin', '*');
    res.end('ok');
    rawResolve?.(Buffer.concat(parts));
  });
}).listen(8799);

const args =
  MODE === 'raw'
    ? [
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgba',
        '-s',
        `${N}x${N}`,
        '-framerate',
        String(fps),
        '-i',
        '-',
        '-c:v',
        'libx264',
        '-profile:v',
        'main',
        '-level',
        '6.1',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-y',
        `recordings/profile-synth-${MODE}.mp4`,
      ]
    : buildFfmpegArgs({ fps, out: `recordings/profile-synth-${MODE}.mp4`, dome: true });
const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
let ffErr = '';
ff.stderr!.on('data', (d) => (ffErr = (ffErr + d).slice(-3000)));
const T: Record<string, number[]> = {
  grant: [],
  rafPerGrant: [],
  capture: [],
  decode: [],
  write: [],
  MB: [],
};
const now = () => performance.now();
const tAll = now();
for (let f = 0; f < FRAMES; f++) {
  const r0 = await page.evaluate(() => (window as any).__raf);
  let t = now();
  await grantAndAwaitExpiry(session, 1000 / fps, `f${f}`);
  T.grant.push(now() - t);
  T.rafPerGrant.push((await page.evaluate(() => (window as any).__raf)) - r0);
  t = now();
  let buf: Buffer;
  if (MODE === 'raw') {
    const got = new Promise<Buffer>((r) => (rawResolve = r));
    await page.evaluate(() => {
      const c = document.getElementById('c') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      void fetch('http://localhost:8799/', { method: 'POST', body: d });
    });
    buf = await got;
    T.capture.push(now() - t);
    T.decode.push(0);
  } else {
    const shot = await session.send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 100,
      fromSurface: true,
      clip: { x: 0, y: 0, width: N, height: N, scale: 1 },
    });
    T.capture.push(now() - t);
    t = now();
    buf = Buffer.from(shot.data, 'base64');
    T.decode.push(now() - t);
  }
  T.MB.push(buf.length / 1e6);
  t = now();
  await new Promise<void>((r, j) => ff.stdin!.write(buf, (e) => (e ? j(e) : r())));
  T.write.push(now() - t);
}
const tLoop = now() - tAll;
ff.stdin!.end();
await new Promise((r) => ff.on('close', r));
const tTotal = now() - tAll;
const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
console.log(`MODE=${MODE} frames=${FRAMES}`);
for (const [k, v] of Object.entries(T))
  console.log(
    k.padEnd(12),
    'median',
    med(v.slice(2)).toFixed(1),
    '| all',
    v.map((x) => x.toFixed(0)).join(' '),
  );
console.log(
  `capture loop ${(tLoop / FRAMES).toFixed(0)} ms/frame; incl. ffmpeg drain ${(tTotal / FRAMES).toFixed(0)} ms/frame`,
);
console.log(
  ffErr
    .split('\n')
    .filter((l) => /frame=|kb\/s:|encoded/.test(l))
    .slice(-3)
    .join('\n'),
);
server.close();
await browser.close();
