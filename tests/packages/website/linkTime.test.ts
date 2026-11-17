import { describe, expect, it } from 'vitest';

import { linkTime } from '../../../packages/website/src/utils/linkTime';

describe('linkTime', () => {
  it.each([
    ['focus=jupiter&t=2026-06-21T12:00Z&fov=40', '2026-06-21T12:00Z'],
    ['t=2000-01-01&focus=earth', '2000-01-01'],
    ['focus=earth&at=5', undefined],
    ['focus=earth', undefined],
  ])('%s', (link, expected) => {
    expect(linkTime(link)).toBe(expected);
  });
});
