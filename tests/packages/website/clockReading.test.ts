import { expect, it } from 'vitest';

import { clockReading } from '../../../packages/website/src/utils/clockReading';

it('reads an instant as the app’s clock does, in UTC to the minute', () => {
  expect(clockReading(Date.parse('2033-03-14T21:00:00Z'))).toBe('2033-03-14 21:00 UTC');
  expect(clockReading(Date.parse('2033-03-18T20:59:59Z'))).toBe('2033-03-18 20:59 UTC');
});
