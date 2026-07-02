/**
 * CompareState — the "compare against a reference galaxy" panel's live
 * session: which reference is active, the one-shot camera view-sync request
 * the bridge forwards to the engine, and the async fit run's progress/result.
 *
 * `viewIntent` is one-shot by construction: it carries a `nonce` alongside
 * the pose so the bridge can detect a *new* request (nonce changed) versus a
 * stale one still sitting in state from the last dispatch — a bare pose with
 * no nonce would need a separate "consumed" flag to avoid re-firing on every
 * unrelated state change.
 *
 * `fitting`/`fitProgress`/`fitScore`/`fitNote`/`report` all describe ONE fit
 * run; they reset together when a new run starts (see the compare slice,
 * plan 03 Task 3) rather than drifting independently.
 */

import type { ViewPose } from '../engine/ViewPose';
import type { MatchReport } from '../matcher/MatchReport';

export type CompareState = {
  readonly open: boolean; // panel visibility (drives setInsets)
  readonly activeId: string; // reference id, default 'm100'
  readonly viewIntent: { readonly pose: ViewPose; readonly nonce: number } | null;
  readonly fitting: boolean;
  readonly fitProgress: number; // 0..1
  readonly fitScore: number | null; // 1..100
  readonly fitNote: string;
  readonly report: MatchReport | null;
  readonly stopRequested: boolean;
};
