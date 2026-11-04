import { describe, expect, it } from 'vitest';
import { isAppUrl } from '../../src/utils/isAppUrl.js';

describe('isAppUrl', () => {
  it('accepts https://localhost:47823 paths', () => {
    expect(isAppUrl('https://localhost:47823/')).toBe(true);
    expect(isAppUrl('https://localhost:47823/?dome&remote#x')).toBe(true);
    expect(isAppUrl('https://localhost:47823/remote.html')).toBe(true);
  });

  it('rejects other ports, http, file and remote hosts', () => {
    expect(isAppUrl('https://localhost:47824/')).toBe(false);
    expect(isAppUrl('https://localhost/')).toBe(false);
    expect(isAppUrl('http://localhost:47823/')).toBe(false);
    expect(isAppUrl('file:///etc/passwd')).toBe(false);
    expect(isAppUrl('https://ned.ipac.caltech.edu/')).toBe(false);
    expect(isAppUrl('https://localhost:47823@evil.example/')).toBe(false);
    expect(isAppUrl('https://localhost.evil.example:47823/')).toBe(false);
    expect(isAppUrl('not a url')).toBe(false);
  });
});
