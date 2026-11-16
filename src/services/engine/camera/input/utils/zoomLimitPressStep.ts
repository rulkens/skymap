/**
 * One step's report against a zoom limit folded into the press (`replayInput`): a fresh notch,
 * or a step that is no notch at all (`liftOff`), pushes at once; a stale one adds its |ln f| to
 * the run on the same edge and pushes once that fills ZOOM_LIMIT_PUSH_LN. No report empties it.
 * No decay clock: a pause long enough to matter makes the next notch fresh anyway.
 */

import { ZOOM_LIMIT_PUSH_LN } from '../../../../../data/input/zoomLimitPushLn';

import type { ZoomLimitPress } from '../../../../../@types/camera/input/ZoomLimitPress';
import type { ZoomLimitPush } from '../../../../../@types/camera/arms/ZoomLimitPush';

export function zoomLimitPressStep(
  press: ZoomLimitPress | null,
  pressed: ZoomLimitPush | undefined,
  notch: { readonly lnZoom: number; readonly fresh: boolean } | null,
): { readonly press: ZoomLimitPress | null; readonly push: ZoomLimitPush | null } {
  if (pressed === undefined) return { press: null, push: null };
  if (notch === null || notch.fresh) return { press: null, push: pressed };
  const ln = (press?.edge === pressed.edge ? press.ln : 0) + notch.lnZoom;
  return ln >= ZOOM_LIMIT_PUSH_LN
    ? { press: null, push: pressed }
    : { press: { edge: pressed.edge, ln }, push: null };
}
