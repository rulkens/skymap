import { describe, expect, it } from 'vitest';
import { defaultRetryPolicy } from '../../../src/services/loading/retryPolicy';
import { HttpError } from '../../../src/services/loading/fetchWithProgress';
import { FormatVersionError } from '../../../src/data/formatVersionError';

describe('defaultRetryPolicy', () => {
  it('gives up on 404', () => {
    expect(defaultRetryPolicy(0, new HttpError(404, 'x'))).toBe('give-up');
  });

  it('retries 502 with 1s on attempt 0, 3s on attempt 1', () => {
    expect(defaultRetryPolicy(0, new HttpError(502, 'x'))).toEqual({ delayMs: 1000 });
    expect(defaultRetryPolicy(1, new HttpError(502, 'x'))).toEqual({ delayMs: 3000 });
  });

  it('gives up after attempt 1 on 5xx', () => {
    expect(defaultRetryPolicy(2, new HttpError(503, 'x'))).toBe('give-up');
  });

  it('retries network error with 1s on attempt 0', () => {
    expect(defaultRetryPolicy(0, new TypeError('NetworkError'))).toEqual({ delayMs: 1000 });
  });

  it('gives up immediately on a format-version mismatch (no re-download)', () => {
    expect(defaultRetryPolicy(0, new FormatVersionError('galaxy catalog', 8, 9, 'x'))).toBe(
      'give-up',
    );
  });
});
