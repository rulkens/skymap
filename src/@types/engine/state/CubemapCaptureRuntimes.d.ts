/**
 * CubemapCaptureRuntimes — every `CUBEMAP_CAPTURES` row's cross-frame bake
 * memory, keyed by row. Total over both key unions, so a read is a plain
 * property access whose kind the key already decides.
 */

import type { ProbeCaptureKey } from '../../rendering/ProbeCaptureKey';
import type { ProbeCaptureRuntime } from './ProbeCaptureRuntime';
import type { SkyCaptureKey } from '../../rendering/SkyCaptureKey';
import type { SkyCaptureRuntime } from './SkyCaptureRuntime';

export type CubemapCaptureRuntimes = Readonly<
  Record<SkyCaptureKey, SkyCaptureRuntime> & Record<ProbeCaptureKey, ProbeCaptureRuntime>
>;
