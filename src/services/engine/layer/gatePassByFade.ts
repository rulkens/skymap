/**
 * Core's gate for a pass that declares `fade`: resolves its handed value, skips the pass
 * while it is 0 (every item 0), and hands the value to all four methods, so draw and pick
 * never disagree (a pure function of the view: each call gets the same value).
 * `state` is the engine's own, bound at wrap time: `PassState` does not carry the entries.
 */

import type { FadeValueOf } from '../../../@types/animation/FadeValueOf';
import type { ShowKey } from '../../../@types/animation/ShowKey';
import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { resolveViewFadeValue } from '../presentation/resolveViewFadeValue';

export function gatePassByFade(
  pass: ContentPass,
  state: Pick<EngineState, 'subsystems' | 'visibilityEntries'>,
): ContentPass {
  const address = pass.fade;
  if (address === undefined) return pass;
  const valueOf = (ctx: FrameView): FadeValueOf<ShowKey> =>
    resolveViewFadeValue(state, ctx, address);
  const isZero = (value: FadeValueOf<ShowKey>): boolean =>
    typeof value === 'number' ? value === 0 : Object.values(value).every((v) => v === 0);
  const gated: ContentPass = {
    ...pass,
    enabled: (s, ctx, view) => {
      const value = valueOf(ctx);
      return !isZero(value) && pass.enabled(s, ctx, view, value);
    },
    draw: (encoder, view, ctx, s) => pass.draw(encoder, view, ctx, s, valueOf(ctx)),
  };
  if (pass.pickEnabled !== undefined) {
    gated.pickEnabled = (s: PassState, ctx: FrameView, view: SlabView) => {
      const value = valueOf(ctx);
      return !isZero(value) && pass.pickEnabled!(s, ctx, view, value);
    };
  }
  if (pass.drawPick !== undefined) {
    gated.drawPick = (
      encoder: GPURenderPassEncoder,
      view: SlabView,
      ctx: FrameView,
      s: PassState,
    ) => pass.drawPick!(encoder, view, ctx, s, valueOf(ctx));
  }
  return gated;
}
