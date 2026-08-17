import { describe, expect, it } from 'vitest';
import { parsePreviewUrl } from '../../../../tools/utils/record/parsePreviewUrl';

describe('parsePreviewUrl', () => {
  it('extracts the Local URL from a plain vite preview banner', () => {
    const stdout =
      '\n  VITE v5.4.10  ready in 320 ms\n\n' +
      '  ➜  Local:   http://localhost:4517/\n' +
      '  ➜  Network: use --host to expose\n';
    expect(parsePreviewUrl(stdout)).toBe('http://localhost:4517');
  });

  it('strips ANSI colour codes wrapping the label and the URL', () => {
    const stdout = '\x1b[32m  ➜  Local:   \x1b[36mhttp://localhost:4517/\x1b[39m\n';
    expect(parsePreviewUrl(stdout)).toBe('http://localhost:4517');
  });

  it('reflects the port vite actually bound when the requested one was busy', () => {
    // strictPort is off by default — vite bumps to the next free port and
    // this is the only place that names it.
    const stdout = '  ➜  Local:   http://localhost:4518/\n';
    expect(parsePreviewUrl(stdout)).toBe('http://localhost:4518');
  });

  it('returns undefined for a chunk that carries no Local line yet', () => {
    expect(parsePreviewUrl('  VITE v5.4.10  ready in 320 ms\n')).toBeUndefined();
  });
});
