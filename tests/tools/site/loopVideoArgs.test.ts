import { describe, expect, it } from 'vitest';

import { SITE_LOOP_PLAN } from '../../../tools/site/siteLoopPlan';
import { loopVideoArgs } from '../../../tools/site/utils/loopVideoArgs';

describe.each(['av1', 'h264'] as const)('loopVideoArgs %s', (codec) => {
  const args = loopVideoArgs(SITE_LOOP_PLAN, codec, 41, 'frames/%04d.png', 'out');
  const after = (flag: string): string => args[args.indexOf(flag) + 1]!;

  // Untagged or full-range, the film sits brighter than the still it lies over.
  it('converts to limited-range BT.709 and says so', () => {
    expect(after('-vf')).toMatch(/in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p$/);
    expect(after('-color_range')).toBe('tv');
    expect(after('-colorspace')).toBe('bt709');
  });

  it('is silent, square at the plan size and at the CRF it was handed', () => {
    expect(args).toContain('-an');
    expect(after('-vf')).toContain(`scale=${SITE_LOOP_PLAN.size}:${SITE_LOOP_PLAN.size}:`);
    expect(after('-framerate')).toBe(String(SITE_LOOP_PLAN.fps));
    expect(after('-crf')).toBe('41');
  });
});
