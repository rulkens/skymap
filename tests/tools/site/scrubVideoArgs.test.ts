import { describe, expect, it } from 'vitest';

import { HERO_MEDIA } from '../../../tools/site/heroMediaPlan';
import { scrubVideoArgs } from '../../../tools/site/utils/scrubVideoArgs';

describe('scrubVideoArgs', () => {
  const args = scrubVideoArgs(HERO_MEDIA, 'in.mp4', 'out.mp4');
  const after = (flag: string): string => args[args.indexOf(flag) + 1]!;

  it('keeps the file seekable, silent and playable everywhere', () => {
    expect(args).toContain('-an');
    expect(after('-movflags')).toBe('+faststart');
    expect(after('-vf')).toMatch(/format=yuv420p$/);
    expect(after('-g')).toBe(String(HERO_MEDIA.fps));
    expect(after('-keyint_min')).toBe(after('-g'));
    expect(after('-sc_threshold')).toBe('0');
  });

  it('cuts the window the plan names', () => {
    expect(after('-ss')).toBe(String(HERO_MEDIA.inSec));
    expect(after('-t')).toBe(String(HERO_MEDIA.outSec - HERO_MEDIA.inSec));
  });
});
