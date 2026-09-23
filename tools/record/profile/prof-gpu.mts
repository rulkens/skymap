// @ts-nocheck — throwaway measurement script, see README.md here
// dome GPU per-slot profiler (scratch, see README.md here)
const BASE = process.env.URL ?? 'http://localhost:5173';
import { launchChromium } from '../../utils/browser/launchChromium';
import { bootHookedPage } from '../../utils/browser/bootHookedPage';
const size = Number(process.env.SIZE ?? 1024),
  frames = Number(process.env.FRAMES ?? 6);
const q = process.env.Q ?? 'perf&dome';
const browser = await launchChromium();
const page = await (
  await browser.newContext({ viewport: { width: size, height: size } })
).newPage();
page.setDefaultNavigationTimeout(300000);
page.on('pageerror', (e) => console.warn('[page]', e.message));
await bootHookedPage(page, `${BASE}/?${q}#t=2026-07-31T12:00:00.000Z`, '__skymapPerf');
const s = (await page.evaluate((n) => (window as any).__skymapPerf.collectTimings(n), frames)) as {
  slot: string;
  ms: number;
  frame: number;
}[];
const by = new Map<string, number[]>();
for (const x of s) (by.get(x.slot) ?? by.set(x.slot, []).get(x.slot)!).push(x.ms);
const med = (a: number[]) => [...a].sort((p, r) => p - r)[a.length >> 1];
const rows = [...by].map(([k, v]) => [k, med(v)] as const).sort((a, b) => b[1] - a[1]);
const fr = new Map<number, number>();
for (const x of s) fr.set(x.frame, (fr.get(x.frame) ?? 0) + x.ms);
console.log('frame total median', med([...fr.values()]).toFixed(1), 'ms over', fr.size, 'frames');
const group = (re: RegExp) => rows.filter(([k]) => re.test(k)).reduce((a, [, v]) => a + v, 0);
for (const f of ['front', 'left', 'right', 'back', 'top'])
  console.log(`face ${f}`.padEnd(14), group(new RegExp(`@dome:${f}$`)).toFixed(1));
console.log('non-face'.padEnd(14), group(/^(?!.*@dome:)/).toFixed(1));
for (const [k, v] of rows.slice(0, 40)) console.log(k.padEnd(40), v.toFixed(2));
await browser.close();
