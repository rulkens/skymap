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
import cx from 'classnames';
import type { GpuTimingService } from '../../@types/gpu/timing/GpuTimingService';
import type { GpuTimingFrame } from '../../@types/gpu/timing/GpuTimingFrame';
import type { TimingSlotName } from '../../@types/gpu/timing/TimingSlotName';
import { TIMED_SLOT_GROUPS } from '../../services/engine/frame/frameProgram';
import { Sparkline } from './Sparkline';
import DebugSection from './DebugSection';
import styles from './GpuTimingsSection.module.css';

// Rows are grouped by the frame program's (target, slab) step structure — the
// SAME grouping RenderTogglesSection uses, so the two lists scan positionally.
// `TIMED_SLOT_GROUPS` is derived from the FRAME program + content-layer
// registry (the list the timing service allocates query-set slots from), so a
// renderer that joins the registry lands in the right group automatically. The
// group header carries slab identity now, so there's no per-row slab badge.

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
  service: GpuTimingService;
};

export function GpuTimingsSection({ service }: GpuTimingsSectionProps): ReactElement {
  // The render-trigger pattern: `tick` increments per frame; the actual
  // stats live in a ref so we don't re-allocate the Map every frame.
  const [, setTick] = useState(0);
  const statsRef = useRef<Map<TimingSlotName, SlotStats>>(new Map());

  useEffect(() => {
    if (!service.enabled) return undefined;

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

  // ── Disabled (URL gate off OR adapter lacks timestamp-query) ──────
  if (!service.enabled) {
    return (
      <DebugSection title="GPU Timings" defaultOpen>
        <div className={styles.notice}>
          GPU timings disabled. Add <code>?gpuTimings</code> to the URL and reload; requires the
          adapter's <code>timestamp-query</code> feature.
        </div>
      </DebugSection>
    );
  }

  // ── Branch 3: live data ───────────────────────────────────────────
  const stats = statsRef.current;
  const avgOf = (row: SlotStats): number =>
    row.recent.length === 0 ? 0 : row.recent.reduce((a, b) => a + b, 0) / row.recent.length;

  // Header sums per-slot AVG_WINDOW averages, matching the visible
  // row values. Stale slots excluded so the total reflects current
  // GPU work, not a gated-off subsystem's last cost.
  let frameTotalMs = 0;
  for (const [, row] of stats) {
    if (row.staleFrames === 0 && row.recent.length > 0) frameTotalMs += avgOf(row);
  }

  return (
    <DebugSection
      title={`GPU Timings (avg ${AVG_WINDOW}f: ${frameTotalMs.toFixed(1)} ms)`}
      defaultOpen
    >
      {/*
        Iterate `TIMED_SLOT_GROUPS` (derived from the FRAME program +
        the CONTENT_LAYERS registry) so groups + row order stay in
        lockstep with the actual renderer draw order — reordering
        CONTENT_LAYERS in `passes/index.ts` automatically reorders the
        timing UI. A slot that hasn't sampled yet is skipped; a group
        with no sampled rows renders no header.
      */}
      {TIMED_SLOT_GROUPS.map((group) => {
        const liveRows = group.rows.filter((r) => stats.has(r.name));
        if (liveRows.length === 0) return null;
        // Per-group subtotal: sum of the group's non-stale row averages, so
        // it reflects current GPU work (a gated-off row's last cost
        // excluded), matching the header total's rule.
        let groupMs = 0;
        for (const r of liveRows) {
          const row = stats.get(r.name)!;
          if (row.staleFrames === 0 && row.recent.length > 0) groupMs += avgOf(row);
        }
        return (
          <div key={group.title} className={styles.group}>
            <div className={styles.groupHeader}>
              {group.title} ({groupMs.toFixed(1)} ms)
            </div>
            {liveRows.map((r) => {
              const row = stats.get(r.name)!;
              // Gate the row's opacity on staleness.  Anything beyond 0
              // means the pass is currently gated off; keep the rolling
              // avg + sparkline visible (so the user can see what it cost
              // when it was on) but dimmed so they don't read it as live.
              const isIdle = row.staleFrames > 0;
              return (
                <div key={r.name} className={cx(isIdle && styles.rowIdle)}>
                  <span className={styles.name}>{r.name}</span>
                  <span className={styles.avg}>{avgOf(row).toFixed(1)} ms</span>
                  <span className={styles.sparklineWrap}>
                    <Sparkline samples={row.spark} />
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </DebugSection>
  );
}
