/** CubemapCaptureKey — names one `APP_CUBEMAP_CAPTURE_REGISTRY` row, of either kind. */

import type { ProbeCaptureKey } from './ProbeCaptureKey';
import type { SkyCaptureKey } from './SkyCaptureKey';

export type CubemapCaptureKey = SkyCaptureKey | ProbeCaptureKey;
