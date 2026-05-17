import { describe, it, expect } from 'vitest';
import { parseFlags } from '../../../../tools/utils/cli/args';

describe('parseFlags', () => {
  it('returns all flags false when none are passed', () => {
    const result = parseFlags([], { '--force': 'bool', '--dry-run': 'bool' });
    expect(result).toEqual({ '--force': false, '--dry-run': false });
  });

  it('returns true for a flag present in argv', () => {
    const result = parseFlags(['--force'], { '--force': 'bool', '--dry-run': 'bool' });
    expect(result).toEqual({ '--force': true, '--dry-run': false });
  });

  it('returns true for each flag independently', () => {
    const result = parseFlags(
      ['--no-cache', '--dry-run'],
      { '--no-cache': 'bool', '--dry-run': 'bool' },
    );
    expect(result).toEqual({ '--no-cache': true, '--dry-run': true });
  });

  it('ignores unrelated argv entries', () => {
    const result = parseFlags(
      ['some-positional', '--force', '--other-flag'],
      { '--force': 'bool' },
    );
    expect(result).toEqual({ '--force': true });
  });

  it('returns the same shape as the schema (no extra keys)', () => {
    const result = parseFlags(['--force'], { '--force': 'bool' });
    expect(Object.keys(result)).toEqual(['--force']);
  });
});
