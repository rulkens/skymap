import { describe, it, expect } from 'vitest';

import { parseShotArgs } from '../../../tools/shot/parseShotArgs';

const LINK = 'focus=body-saturn';

describe('parseShotArgs', () => {
  it('defaults', () => {
    expect(parseShotArgs([LINK])).toEqual({
      links: [{ search: '', hash: LINK }],
      url: undefined,
      build: false,
      out: undefined,
      width: 1600,
      height: 900,
      dpr: 2,
      hideUi: false,
      hideLabels: false,
      timeoutMs: 30000,
    });
  });
  it('reads --size, --dpr and --timeout (seconds to ms)', () => {
    const o = parseShotArgs([LINK, '--size', '1280x720', '--dpr', '1', '--timeout', '5']);
    expect([o.width, o.height, o.dpr, o.timeoutMs]).toEqual([1280, 720, 1, 5000]);
  });
  it('strips trailing slash from --url', () => {
    expect(parseShotArgs([LINK, '--url', 'http://localhost:5174//']).url).toBe(
      'http://localhost:5174',
    );
  });
  it('throws when no link is given', () => {
    expect(() => parseShotArgs(['--build'])).toThrow(/no link/);
  });
  it('throws on --out with more than one link', () => {
    expect(() => parseShotArgs([LINK, 'focus=b', '--out', 'x.png'])).toThrow(/--out/);
  });
  it('throws on --build together with --url', () => {
    expect(() => parseShotArgs([LINK, '--build', '--url', 'http://x'])).toThrow(/--build/);
  });
  it('throws on a --url carrying a query or hash', () => {
    expect(() => parseShotArgs([LINK, '--url', 'http://x/?a'])).toThrow(/--url/);
    expect(() => parseShotArgs([LINK, '--url', 'http://x/#a'])).toThrow(/--url/);
  });
  it('throws on an unknown flag', () => {
    expect(() => parseShotArgs([LINK, '--bogus'])).toThrow(/--bogus/);
  });
  it('throws on a non-positive --dpr or --timeout', () => {
    expect(() => parseShotArgs([LINK, '--dpr', '0'])).toThrow(/--dpr/);
    expect(() => parseShotArgs([LINK, '--timeout', '-1'])).toThrow(/--timeout/);
  });
  it('a value flag followed by another flag is an error', () => {
    expect(() => parseShotArgs([LINK, '--out', '--hide-ui'])).toThrow(/--out requires a value/);
  });
  it('a value flag at the end of argv is an error', () => {
    expect(() => parseShotArgs([LINK, '--dpr'])).toThrow(/--dpr requires a value/);
  });
});
