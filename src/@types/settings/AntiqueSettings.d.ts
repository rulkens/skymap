/**
 * AntiqueSettings — the engraved-atlas look. `enabled` is read at
 * frame-program BUILD: it reroutes the swap-chain lines into the `print` row
 * and adds the `stylize` step, so it changes the pass shape, not a uniform.
 * `tuning` is the debug panel's, read as uniforms every frame.
 */

import type { AntiqueTuning } from './AntiqueTuning';

export type AntiqueSettings = {
  enabled: boolean;
  tuning: AntiqueTuning;
};
