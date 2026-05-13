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
import { HDR_PASSES } from '../../services/engine/frame/passes';
import { Sparkline } from './Sparkline';

// Row display order: the HDR_PASSES array (which is the source of
// truth for HDR rendering order in `renderFrame`), with `tone-map`
// and `pick` appended.  Those two passes live OUTSIDE HDR_PASSES
// (tone-map runs after the HDR block; pick is its own encoder
// submitted by the pick renderer) and so don't appear in
// `HDR_PASSES.map(p => p.name)`.  Listing them explicitly here keeps
// the panel's row order in lockstep with the renderer's draw
// sequence, so reordering passes in `passes/index.ts` automatically
// reorders the timing UI.
const DISPLAY_SLOT_ORDER: readonly TimingSlotName[] = [
  ...HDR_PASSES.map((p) => p.name as TimingSlotName),
  'tone-map',
  'pick',
];

const AVG_WINDOW = 60;
const SPARKLINE_WINDOW = 8;

type SlotStats = {
  recent: number[]; // up to AVG_WINDOW entries; newest at the end.
  spark: number[]; // up to SPARKLINE_WINDOW entries; newest at the end.
  // Number of frames since this slot last reported a sample.  Zero means
  // the slot ran in the current frame; positive means the pass is gated
  // off (e.g. user toggled the subsystem) and the row should render
  // grayed out — the previous avg/sparkline are still informative ("this
  // is what it cost when it was on") but the user shouldn't read them as
  // a live cost.
  staleFrames: number;
};

export type GpuTimingsSectionProps = {
  service: GpuTimingService | null;
};

export function GpuTimingsSection({ service }: GpuTimingsSectionProps): ReactElement {
  // The render-trigger pattern: `tick` increments per frame; the actual
  // stats live in a ref so we don't re-allocate the Map every frame.
  const [, setTick] = useState(0);
  const statsRef = useRef<Map<TimingSlotName, SlotStats>>(new Map());

  useEffect(() => {
    if (!service || !service.available) return undefined;

    const unsub = service.subscribe((frame: GpuTimingFrame) => {
      const stats = statsRef.current;
      // Increment staleFrames for every existing row, then reset to 0
      // for rows that the current frame reports samples for.  Slots
      // that never ran stay absent from `stats` and won't render at all.
      for (const [, row] of stats) {
        row.staleFrames += 1;
      }
      for (const [slot, ms] of frame.perPassMs) {
        let row = stats.get(slot);
        if (!row) {
          row = { recent: [], spark: [], staleFrames: 0 };
          stats.set(slot, row);
        }
        row.recent.push(ms);
        if (row.recent.length > AVG_WINDOW) row.recent.shift();
        row.spark.push(ms);
        if (row.spark.length > SPARKLINE_WINDOW) row.spark.shift();
        row.staleFrames = 0;
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
        <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>GPU Timings</summary>
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
        <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>GPU Timings</summary>
        <div style={{ marginTop: 4, opacity: 0.7 }}>GPU timings unavailable on this adapter.</div>
      </details>
    );
  }

  // ── Branch 3: live data ───────────────────────────────────────────
  const stats = statsRef.current;
  // Sum of CURRENT-FRAME timings for the header.  Only count slots that
  // actually ran this frame (staleFrames === 0); idle slots' last
  // value is no longer the live frame's cost.
  let frameTotalMs = 0;
  for (const [, row] of stats) {
    if (row.staleFrames === 0 && row.recent.length > 0) {
      frameTotalMs += row.recent[row.recent.length - 1]!;
    }
  }

  return (
    <details open>
      <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>
        GPU Timings (last frame: {frameTotalMs.toFixed(1)} ms)
      </summary>
      <div style={{ marginTop: 4 }}>
        {/*
          Iterate `DISPLAY_SLOT_ORDER` (derived from HDR_PASSES + the
          two trailing passes) rather than `stats` directly so row
          order is stable regardless of which slot emits first.  Slots
          that haven't sampled yet are simply skipped (no row).  This
          keeps the panel in lockstep with the actual renderer draw
          order — reordering HDR_PASSES in `passes/index.ts`
          automatically reorders the timing UI.
        */}
        {DISPLAY_SLOT_ORDER.map((slot) => {
          const row = stats.get(slot);
          if (!row) return null;
          const avg =
            row.recent.length === 0 ? 0 : row.recent.reduce((a, b) => a + b, 0) / row.recent.length;
          // Gate the row's opacity on staleness.  Anything beyond 0
          // means the pass is currently gated off; keep the rolling
          // avg + sparkline visible (so the user can see what it cost
          // when it was on) but dimmed so they don't read it as live.
          const isIdle = row.staleFrames > 0;
          return (
            <div key={slot} style={isIdle ? { opacity: 0.4 } : undefined}>
              <span style={{ display: 'inline-block', width: 130 }}>{slot}</span>
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
