import { describe, expect, it } from 'vitest';

import { SITE_LOOP_PLAN } from '../../../tools/site/siteLoopPlan';
import { loopVideoArgs } from '../../../tools/site/utils/loopVideoArgs';

describe('loopVideoArgs', () => {
  const args = loopVideoArgs(
    { fps: SITE_LOOP_PLAN.fps, width: 960, height: 540 },
    35,
    'frames/%04d.png',
    'out.mp4',
  );
  const after = (flag: string): string => args[args.indexOf(flag) + 1]!;

  // Untagged or full-range, the film sits brighter than the still it lies over.
  it('converts to limited-range BT.709 and says so', () => {
    expect(after('-vf')).toMatch(/in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p$/);
    expect(after('-color_range')).toBe('tv');
    expect(after('-colorspace')).toBe('bt709');
  });

  it('is silent, at the size and the CRF it was handed', () => {
    expect(args).toContain('-an');
    expect(after('-vf')).toContain('scale=960:540:');
    expect(after('-framerate')).toBe(String(SITE_LOOP_PLAN.fps));
    expect(after('-crf')).toBe('35');
  });
});
