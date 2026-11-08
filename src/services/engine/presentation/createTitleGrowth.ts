/**
 * createTitleGrowth — eases a name between its cut's size (0) and the subject's
 * title size (1) when it is selected or let go. Each ramp is a value of time
 * (its start, from and to), evaluated against the frame's clock like the label
 * envelopes, so a skipped frame lands where it should and a reversal mid-ramp
 * leaves from where the size stands.
 */

import type { TitleGrowth } from '../../../@types/engine/presentation/TitleGrowth';
import { smoothstep } from '../../../utils/math/smoothstep';

type Ramp = { from: number; to: number; startMs: number };

export function createTitleGrowth(durationMs: number): TitleGrowth {
  const ramps = new Map<string, Ramp>();
  const seen = new Set<string>();
  const valueAt = (r: Ramp, nowMs: number) =>
    r.from + (r.to - r.from) * smoothstep(0, 1, (nowMs - r.startMs) / durationMs);

  return {
    blend(id, isTitle, nowMs) {
      const to = isTitle ? 1 : 0;
      let ramp = ramps.get(id);
      if (!ramp) {
        if (!isTitle) return 0;
        ramp = { from: 0, to, startMs: nowMs };
        ramps.set(id, ramp);
      } else if (ramp.to !== to) {
        ramp.from = valueAt(ramp, nowMs);
        ramp.to = to;
        ramp.startMs = nowMs;
      }
      seen.add(id);
      return valueAt(ramp, nowMs);
    },
    tracks: (id) => ramps.has(id),
    endFrame(nowMs) {
      let running = false;
      for (const [id, ramp] of ramps) {
        const done = nowMs - ramp.startMs >= durationMs;
        if (!seen.has(id) || (done && ramp.to === 0)) ramps.delete(id);
        else if (!done) running = true;
      }
      seen.clear();
      return running;
    },
  };
}
