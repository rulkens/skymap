/**
 * GpuTimingsSection — live readout of the gpuTimingService.
 *
 * Subscribes to one `GpuTimingFrame` channel on mount.  Maintains a
 * per-slot rolling window of recent durations (60 frames for the
 * average; 8 frames for the sparkline) in React state, normalised to
 * milliseconds.  Re-renders on every emitted frame — at 60 fps
 * that's 60 React renders per second, well within React's idle
 * budget for a small subtree (10 rows × ~5 nodes each).
 *
 * Three branches keep the component honest about its environment:
 *
 *   1. `service === null` — engine constructed without `?gpuTimings`.
 *      Helpful nudge so the user knows the panel exists but is dark.
 *   2. `service.available === false` — engine has the service but
 *      the adapter lacks `timestamp-query`.  No frames will ever
 *      arrive; render the static "unavailable" message.
 *   3. `service.available === true` — render the live rows.
 *
 * ### Why per-slot state rather than a single object
 *
 * React's referential-equality fast-path benefits from per-slot
 * arrays held in a Map: each slot's update is isolated, and a
 * sub-tree memoisation (added later) can short-circuit on per-row
 * reference equality.  For now we just re-render the whole section
 * — the cost is negligible.
 *
 * ### Why 60-frame average + 8-sample sparkline
 *
 * Matches the spec's "Layout sketch" section.  60 frames is one
 * second at 60 fps — long enough to smooth out per-frame noise,
 * short enough to react to settings flips (e.g. toggling filaments
 * off mid-session).  8-sample sparkline keeps each row to ~12 chars
 * wide.
 *
 * ### Why stats live in a ref + a tick-counter `useState`
 *
 * The natural shape would be `useState<Map<...>>` and a `new Map`
 * on every frame.  At 60 fps that's 60 Map allocations per second
 * for a hot debug overlay.  Keeping the Map in a `useRef` and
 * mutating it in place, then bumping a `tick` counter to trigger
 * the re-render, avoids that churn entirely while still giving
 * React's reconciler a fresh prop on every flush.
 */

import { useEffect, useState, useRef, type ReactElement } from 'react';
import type { GpuTimingService } from '../../@types/gpu/timing/GpuTimingService';
import type { GpuTimingFrame } from '../../@types/gpu/timing/GpuTimingFrame';
import type { TimingSlotName } from '../../@types/gpu/timing/TimingSlotName';
import { Sparkline } from './Sparkline';

const AVG_WINDOW = 60;
const SPARKLINE_WINDOW = 8;

type SlotStats = {
  recent: number[]; // up to AVG_WINDOW entries; newest at the end.
  spark: number[]; // up to SPARKLINE_WINDOW entries; newest at the end.
};

export type GpuTimingsSectionProps = {
  service: GpuTimingService | null;
};

export function GpuTimingsSection({
  service,
}: GpuTimingsSectionProps): ReactElement {
  // The render-trigger pattern: `tick` increments per frame; the actual
  // stats live in a ref so we don't re-allocate the Map every frame.
  const [, setTick] = useState(0);
  const statsRef = useRef<Map<TimingSlotName, SlotStats>>(new Map());

  useEffect(() => {
    if (!service || !service.available) return undefined;

    const unsub = service.subscribe((frame: GpuTimingFrame) => {
      const stats = statsRef.current;
      for (const [slot, ms] of frame.perPassMs) {
        let row = stats.get(slot);
        if (!row) {
          row = { recent: [], spark: [] };
          stats.set(slot, row);
        }
        row.recent.push(ms);
        if (row.recent.length > AVG_WINDOW) row.recent.shift();
        row.spark.push(ms);
        if (row.spark.length > SPARKLINE_WINDOW) row.spark.shift();
      }
      setTick((n) => n + 1);
    });

    return () => {
      unsub();
    };
  }, [service]);

  // ── Branch 1: no service ──────────────────────────────────────────
  if (service === null) {
    return (
      <details open>
        <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>
          GPU Timings
        </summary>
        <div style={{ marginTop: 4, opacity: 0.7 }}>
          Add <code>?gpuTimings</code> to the URL to enable.
        </div>
      </details>
    );
  }

  // ── Branch 2: feature missing ─────────────────────────────────────
  if (!service.available) {
    return (
      <details open>
        <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>
          GPU Timings
        </summary>
        <div style={{ marginTop: 4, opacity: 0.7 }}>
          GPU timings unavailable on this adapter.
        </div>
      </details>
    );
  }

  // ── Branch 3: live data ───────────────────────────────────────────
  const stats = statsRef.current;
  // Sum of last-frame timings for the header.  Use the last entry in
  // each slot's `recent` array — that's "this most recent frame's"
  // value.  Slots that haven't sampled yet contribute 0.
  let frameTotalMs = 0;
  for (const [, row] of stats) {
    if (row.recent.length > 0) {
      frameTotalMs += row.recent[row.recent.length - 1]!;
    }
  }

  return (
    <details open>
      <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>
        GPU Timings (last frame: {frameTotalMs.toFixed(1)} ms)
      </summary>
      <div style={{ marginTop: 4 }}>
        {Array.from(stats).map(([slot, row]) => {
          const avg =
            row.recent.length === 0
              ? 0
              : row.recent.reduce((a, b) => a + b, 0) / row.recent.length;
          return (
            <div key={slot}>
              <span style={{ display: 'inline-block', width: 130 }}>
                {slot}
              </span>
              <span
                style={{
                  display: 'inline-block',
                  width: 70,
                  textAlign: 'right',
                }}
              >
                {avg.toFixed(1)} ms
              </span>
              <span style={{ marginLeft: 8 }}>
                <Sparkline samples={row.spark} />
              </span>
            </div>
          );
        })}
      </div>
    </details>
  );
}
