/**
 * FRAME_ORDER_PASS_NAMES — every pass name any `FRAME_ORDER` line authors.
 * Pass names are AUTHORED here, implementations are COMPOSED per Layer, so the
 * two module-init readers (the GPU timing layout, the debug toggle list) size
 * off the names: neither can see a Layer closure that only exists after boot.
 */

import { FRAME_ORDER } from './frameOrder';

export const FRAME_ORDER_PASS_NAMES: readonly string[] = [
  ...new Set(
    FRAME_ORDER.flatMap((spec): readonly string[] => {
      if (spec.kind === 'render') return spec.passes;
      if (spec.kind === 'capture')
        return [...spec.cosmoPasses, ...spec.near0Passes, ...spec.bodyPasses];
      if (spec.kind === 'foreground') return [...spec.near0Passes, ...spec.bodyPasses];
      return [];
    }),
  ),
];
