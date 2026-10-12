import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { delay } from '../utils/async/delay';
import type { PhoneArgs } from './@types/PhoneArgs';
import type { TraceEvent } from './@types/TraceEvent';
import { attachPhoneTab } from './attachPhoneTab';
import { linkUrl } from './linkUrl';
import { loadUrl } from './loadUrl';
import { PHONE_PATHS } from './PHONE_PATHS';
import { readLastTarget } from './readLastTarget';
import { serverOrigin } from './serverOrigin';
import { summarizeFrames } from './summarizeFrames';
import { withPhone } from './withPhone';

const SETTLE_AFTER_LOAD_MS = 10_000;
const DEFAULT_FOR_MS = 5000;
const COMPLETE_TIMEOUT_MS = 60_000;
const CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'gpu',
  'disabled-by-default-gpu.dawn',
];

/**
 * Record a `Tracing` session on the last tab (loaded at the link and settled
 * for `--wait`, when given) and print a frame summary beside the raw trace,
 * which DevTools' Performance panel opens. No summary is printed when the
 * trace holds too few frames to say anything.
 */
export async function traceCommand(args: PhoneArgs): Promise<void> {
  await withPhone(async (client) => {
    const tab = await attachPhoneTab(client, readLastTarget());
    if (tab.fresh && args.link === undefined) throw new Error('no tab to trace: give a link');
    if (args.link !== undefined) {
      await loadUrl(client, tab.sessionId, linkUrl(serverOrigin(args), args.link));
      await delay(args.waitMs ?? SETTLE_AFTER_LOAD_MS);
    }
    const events: TraceEvent[] = [];
    let complete = (): void => {};
    const completed = new Promise<void>((done) => (complete = done));
    client.onEvent(({ method, params, sessionId }) => {
      if (sessionId !== tab.sessionId) return;
      if (method === 'Tracing.dataCollected') events.push(...(params.value as TraceEvent[]));
      if (method === 'Tracing.tracingComplete') complete();
    });
    await client.call(
      'Tracing.start',
      {
        transferMode: 'ReportEvents',
        traceConfig: { recordMode: 'recordContinuously', includedCategories: CATEGORIES },
      },
      tab.sessionId,
    );
    await delay(args.forMs ?? DEFAULT_FOR_MS);
    await client.call('Tracing.end', {}, tab.sessionId);
    await Promise.race([
      completed,
      delay(COMPLETE_TIMEOUT_MS).then(() => {
        throw new Error(`trace data still streaming after ${COMPLETE_TIMEOUT_MS} ms`);
      }),
    ]);

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const out = resolve(join(PHONE_PATHS.traces, `trace-${stamp}.json`));
    mkdirSync(resolve(PHONE_PATHS.traces), { recursive: true });
    writeFileSync(out, JSON.stringify({ traceEvents: events }));
    console.log(`raw trace (${events.length} events): ${out}`);
    const s = summarizeFrames(events);
    if (s === undefined) {
      console.log('no frame summary: fewer than 3 rAF callbacks (a still scene renders on demand)');
      return;
    }
    const ms = (n: number): string => n.toFixed(1);
    console.log(`frames: ${s.frames} in ${ms(s.spanMs)} ms`);
    console.log(
      `frame interval  median ${ms(s.intervalMedianMs)} ms  p95 ${ms(s.intervalP95Ms)} ms`,
    );
    console.log(
      `rAF callback    median ${ms(s.callbackMedianMs)} ms  p95 ${ms(s.callbackP95Ms)} ms`,
    );
  });
}
