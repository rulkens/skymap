/**
 * The handed value for a per-view consumer: `resolveFadeValue` times the address's distance
 * band at this view. Once-scope computes and planners read it at the canvas view (see
 * `gateComputeByFade`, `gatePlannerByFade`); scene-body admission reads the frame camera.
 * Memoised per view and address, since `gatePassByFade` asks up to four times per pass per
 * view; a view is minted per frame, so the memo never outlives the snapshot it read.
 */

import type { FadeValueOf } from '../../../@types/animation/FadeValueOf';
import type { VisibilityAddress } from '../../../@types/animation/VisibilityAddress';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { resolveFadeValue } from './resolveFadeValue';
import { viewBandOf } from './viewBandOf';

const memo = new WeakMap<FrameView, Map<VisibilityAddress, unknown>>();

export function resolveViewFadeValue<A extends VisibilityAddress>(
  state: Pick<EngineState, 'subsystems' | 'visibilityEntries'>,
  view: FrameView,
  address: A,
): FadeValueOf<A> {
  let byAddress = memo.get(view);
  if (byAddress === undefined) memo.set(view, (byAddress = new Map()));
  if (byAddress.has(address)) return byAddress.get(address) as FadeValueOf<A>;
  const entries = state.visibilityEntries;
  const fade = resolveFadeValue(state, view.snapshot, address) as
    | number
    | Readonly<Record<string, number>>;
  const value =
    typeof fade === 'number'
      ? fade * viewBandOf(entries, address, undefined, view)
      : Object.fromEntries(
          Object.entries(fade).map(([item, v]) => [
            item,
            v * viewBandOf(entries, address, item, view),
          ]),
        );
  byAddress.set(address, value);
  return value as FadeValueOf<A>;
}
