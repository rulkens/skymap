// @ts-nocheck — throwaway measurement script, see README.md here
// scratch profiler: can the page itself encode the dome master?
const BASE = process.env.URL ?? 'http://localhost:5173';
import { launchChromium } from '../../utils/browser/launchChromium';
const browser = await launchChromium();
const page = await browser.newPage();
await page.goto(`${BASE}/robots.txt`);
const out = await page.evaluate(async () => {
  const res: string[] = [];
  const N = 4096;
  const cfgs: [string, VideoEncoderConfig][] = [
    [
      'h264 Main L6.1 hw-pref',
      {
        codec: 'avc1.4D403D',
        width: N,
        height: N,
        bitrate: 60e6,
        framerate: 30,
        hardwareAcceleration: 'prefer-hardware',
      },
    ],
    [
      'h264 Main L6.1 sw',
      {
        codec: 'avc1.4D403D',
        width: N,
        height: N,
        bitrate: 60e6,
        framerate: 30,
        hardwareAcceleration: 'prefer-software',
      },
    ],
    [
      'h264 High L6.1 any',
      { codec: 'avc1.64003D', width: N, height: N, bitrate: 60e6, framerate: 30 },
    ],
    [
      'h264 Main L5.1 2048',
      { codec: 'avc1.4D4033', width: 2048, height: 2048, bitrate: 30e6, framerate: 30 },
    ],
    ['hevc main', { codec: 'hvc1.1.6.L183.B0', width: N, height: N, bitrate: 60e6, framerate: 30 }],
    ['av1', { codec: 'av01.0.16M.08', width: N, height: N, bitrate: 60e6, framerate: 30 }],
  ];
  for (const [name, c] of cfgs) {
    const s = await VideoEncoder.isConfigSupported(c).catch(
      (e) => ({ supported: false, err: String(e) }) as any,
    );
    res.push(`${name}: supported=${s.supported}${s.err ? ' ' + s.err : ''}`);
  }
  // throughput of whatever h264 config works at 4096², starfield-like noise frames
  const c = cfgs.find(() => true)![1];
  for (const [name, cfg] of cfgs.slice(0, 3)) {
    if (!(await VideoEncoder.isConfigSupported(cfg)).supported) continue;
    let bytes = 0,
      n = 0;
    const enc = new VideoEncoder({
      output: (ch) => {
        bytes += ch.byteLength;
        n++;
      },
      error: (e) => res.push('enc error ' + e),
    });
    enc.configure(cfg);
    const cv = new OffscreenCanvas(N, N);
    const g = cv.getContext('2d')!;
    const t0 = performance.now();
    const F = 20;
    for (let i = 0; i < F; i++) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, N, N);
      g.fillStyle = '#fff';
      for (let k = 0; k < 20000; k++) g.fillRect(Math.random() * N, Math.random() * N, 2, 2);
      const vf = new VideoFrame(cv, { timestamp: (i * 1e6) / 30 });
      enc.encode(vf, { keyFrame: i === 0 });
      vf.close();
    }
    await enc.flush();
    res.push(
      `${name}: ${F} frames in ${(performance.now() - t0).toFixed(0)} ms (incl. 2D draw) → ${((performance.now() - t0) / F).toFixed(0)} ms/frame, ${n} chunks, ${(bytes / F / 1e6).toFixed(2)} MB/frame`,
    );
    enc.close();
    void c;
  }
  return res;
});
console.log(out.join('\n'));
await browser.close();
