import { expect, it } from 'vitest';

import { formatDate } from '../../../packages/website/src/utils/formatDate';

it('writes an ISO date the house way, with no ordinal and no zero padding', () => {
  expect(formatDate('2026-10-06')).toBe('6 October 2026');
  expect(formatDate('2026-01-31')).toBe('31 January 2026');
});
