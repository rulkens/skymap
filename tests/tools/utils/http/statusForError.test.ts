import { describe, expect, it } from 'vitest';
import { statusForError } from '../../../../tools/utils/http/statusForError';
import type { ErrorStatusRule } from '../../../../tools/utils/http/ErrorStatusRule';

describe('statusForError', () => {
  it("returns the first matching rule's status, ignoring later matches", () => {
    const rules: readonly ErrorStatusRule[] = [
      { test: () => true, status: 413 },
      { test: () => true, status: 400 },
    ];
    expect(statusForError(new Error('x'), rules)).toBe(413);
  });

  it('returns undefined when no rule matches, leaving the default to the caller', () => {
    const rules: readonly ErrorStatusRule[] = [{ test: () => false, status: 400 }];
    expect(statusForError(new Error('x'), rules)).toBeUndefined();
  });

  it('picks the matching rule out of several non-matching ones', () => {
    const rules: readonly ErrorStatusRule[] = [
      { test: (err) => (err as Error).message === 'a', status: 400 },
      { test: (err) => (err as Error).message === 'b', status: 502 },
    ];
    expect(statusForError(new Error('b'), rules)).toBe(502);
  });
});
