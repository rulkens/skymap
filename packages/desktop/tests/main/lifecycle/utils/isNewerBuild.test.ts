import { describe, expect, it } from 'vitest';
import { isNewerBuild } from '../../../../src/main/lifecycle/utils/isNewerBuild';

const OURS = '2026-11-06T18:54:08.326Z';

describe('isNewerBuild', () => {
  it('takes over only for a later build', () => {
    expect(isNewerBuild({ builtAt: '2026-11-06T19:10:00.000Z' }, OURS)).toBe(true);
    expect(isNewerBuild({ builtAt: OURS }, OURS)).toBe(false);
    expect(isNewerBuild({ builtAt: '2026-11-05T22:00:00.000Z' }, OURS)).toBe(false);
  });

  // Builds from before this rule send nothing with their request.
  it('treats a launch that sent no build time as older', () => {
    expect(isNewerBuild({}, OURS)).toBe(false);
    expect(isNewerBuild(null, OURS)).toBe(false);
    expect(isNewerBuild({ builtAt: 42 }, OURS)).toBe(false);
  });
});
