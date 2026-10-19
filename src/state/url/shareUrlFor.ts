/**
 * shareUrlFor — the one composer of a share URL: the current hash body with
 * `t` overridden from the rendered frame's sim instant (not the clock
 * anchor, so a live clock still yields a reproducible link) and `pose`
 * appended (no `t` past the `Date` range). Used by the `l`-key log and the DebugPanel's copy-URL button.
 */

import { hashBodyFor } from './hashBodyFor';
import { parseHashParams } from '../../utils/url/parseHashParams';
import { composeHashParams } from '../../utils/url/composeHashParams';
import { encodeFramedPose } from '../../utils/url/encodeFramedPose';
import { isoOfSimDays } from '../../utils/time/isoOfSimDays';

import type { FramedCameraPose } from '../../@types/camera/FramedCameraPose';
import type { RootState } from '../../store/types';

export function shareUrlFor(
  state: RootState,
  framed: FramedCameraPose,
  simDays: number,
  base: { readonly origin: string; readonly pathname: string; readonly search: string },
): string {
  const params = new Map(parseHashParams(hashBodyFor(state)));
  const iso = isoOfSimDays(simDays);
  if (iso === null) params.delete('t');
  else params.set('t', iso);
  params.set('pose', encodeFramedPose(framed));
  return `${base.origin}${base.pathname}${base.search}#${composeHashParams(params)}`;
}
