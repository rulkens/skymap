/**
 * shareUrlFor — the one composer of a share URL: the current hash body with
 * `t` overridden from the rendered frame's sim instant (not the clock
 * anchor, so a live clock still yields a reproducible link), `pose`
 * appended, and `layers` naming every switch that differs from boot. Used by
 * the `l`-key log and the DebugPanel's copy-URL button.
 */

import { hashBodyFor } from './hashBodyFor';
import { INITIAL_SETTINGS } from '../settings/initialSettings';
import { selectSettings } from '../settings/selectSettings';
import { parseHashParams } from '../../utils/url/parseHashParams';
import { composeHashParams } from '../../utils/url/composeHashParams';
import { encodeFramedPose } from '../../utils/url/encodeFramedPose';
import { encodeLayerSwitches } from '../../utils/url/encodeLayerSwitches';
import { layerSwitchesFrom } from '../../utils/url/layerSwitchesFrom';
import { julianDaysToUnixMs } from '../../utils/time/julianDaysToUnixMs';

import type { FramedCameraPose } from '../../@types/camera/pose/FramedCameraPose';
import type { RootState } from '../../store/types';

export function shareUrlFor(
  state: RootState,
  framed: FramedCameraPose,
  simDays: number,
  base: { readonly origin: string; readonly pathname: string; readonly search: string },
): string {
  const params = new Map(parseHashParams(hashBodyFor(state)));
  params.set('t', new Date(julianDaysToUnixMs(simDays)).toISOString());
  params.set('pose', encodeFramedPose(framed));
  const layers = encodeLayerSwitches(layerSwitchesFrom(selectSettings(state), INITIAL_SETTINGS));
  if (layers !== '') params.set('layers', layers);
  return `${base.origin}${base.pathname}${base.search}#${composeHashParams(params)}`;
}
