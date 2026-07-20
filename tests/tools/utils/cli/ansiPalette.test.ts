/**
 * ansiPalette — real on/off behavior, not a mirror of the escape constants.
 *
 * The only thing worth pinning is the two-state contract: when enabled a
 * colorizer wraps its argument in the SGR escape + reset (so a TTY renders
 * color); when disabled it is the identity (so piped/JSON output stays clean).
 * Restating each colour's numeric code would be a constant-mirror test, so we
 * assert the STRUCTURE instead — an escape is present when on, absent when off.
 */

import { describe, it, expect } from 'vitest';

import { ansiPalette } from '../../../../tools/utils/cli/ansiPalette';

describe('ansiPalette', () => {
  it('wraps in an ANSI escape + reset when enabled', () => {
    const p = ansiPalette(true);
    const out = p.red('x');
    expect(out).toContain('\x1b[31m');
    expect(out).toContain('\x1b[0m');
    expect(out).toContain('x');
  });

  it('is the identity when disabled — no escapes', () => {
    const p = ansiPalette(false);
    expect(p.red('x')).toBe('x');
    expect(p.green('x')).toBe('x');
    expect(p.yellow('x')).toBe('x');
    expect(p.dim('x')).toBe('x');
    expect(p.bold('x')).toBe('x');
  });

  it('exposes every colorizer the report needs', () => {
    const p = ansiPalette(true);
    for (const name of ['red', 'green', 'yellow', 'dim', 'bold'] as const) {
      expect(p[name]('s')).not.toBe('s');
    }
  });
});
