/** Off by default: the streams are an overlay the viewer opts into. */

import type { StellarStreamsSettings } from '../../@types/StellarStreamsSettings';
import { STELLAR_STREAMS_LOOKS } from '../../streaks/data/stellarStreamsLooks';

export const initialState: StellarStreamsSettings = {
  enabled: false,
  labelEnabled: true,
  ...STELLAR_STREAMS_LOOKS,
};
