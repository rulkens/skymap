import { describe, expect, it } from 'vitest';

import { parseMockArgs } from '../../../tools/mock/parseMockArgs';

const URL = ['--url', 'http://localhost:5174/'];

describe('parseMockArgs', () => {
  it('reads name and hash, strips a leading # and the trailing slash', () => {
    const o = parseMockArgs(['chip', '#focus=body-saturn', ...URL]);
    expect([o.name, o.hash, o.url]).toEqual(['chip', 'focus=body-saturn', 'http://localhost:5174']);
  });
  it('defaults to a desktop viewport and an empty hash', () => {
    const o = parseMockArgs(['chip', ...URL]);
    expect([o.hash, o.width, o.height, o.phone]).toEqual(['', 1728, 1000, false]);
  });
  it('--phone switches to the phone viewport; --size overrides the desktop one', () => {
    const phone = parseMockArgs(['chip', ...URL, '--phone']);
    expect([phone.width, phone.height, phone.phone]).toEqual([400, 850, true]);
    const sized = parseMockArgs(['chip', ...URL, '--size', '1280x720']);
    expect([sized.width, sized.height]).toEqual([1280, 720]);
  });
  it('rejects --phone together with --size', () => {
    expect(() => parseMockArgs(['chip', ...URL, '--phone', '--size', '800x600'])).toThrow(
      /--phone/,
    );
  });
  it('requires a --url without its own query or hash', () => {
    expect(() => parseMockArgs(['chip'])).toThrow(/--url is required/);
    expect(() => parseMockArgs(['chip', '--url', 'http://x/?a'])).toThrow(/--url/);
  });
  it('rejects a missing name, a name that is not one path segment, and a third positional', () => {
    expect(() => parseMockArgs(URL)).toThrow(/no mock name/);
    expect(() => parseMockArgs(['../chip', ...URL])).toThrow(/mock name/);
    expect(() => parseMockArgs(['chip', 'a=1', 'b=2', ...URL])).toThrow(/unexpected argument/);
  });
});
