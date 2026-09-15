/** CubemapCaptureKey — names one `CUBEMAP_CAPTURES` row, of either kind. */

import type { ProbeCaptureKey } from './ProbeCaptureKey';
import type { SkyCaptureKey } from './SkyCaptureKey';

export type CubemapCaptureKey = SkyCaptureKey | ProbeCaptureKey;
