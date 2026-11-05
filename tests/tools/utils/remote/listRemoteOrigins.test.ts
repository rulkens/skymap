import { describe, expect, it } from 'vitest';
import { listRemoteOrigins } from '../../../../tools/utils/remote/listRemoteOrigins';

describe('listRemoteOrigins', () => {
  it('origins lists localhost last', () => {
    const origins = listRemoteOrigins(5174, true, false);
    expect(origins.at(-1)).toBe('http://localhost:5174');
    expect(origins.every((origin) => origin.endsWith(':5174'))).toBe(true);
  });

  it('a server not exposed on the LAN lists only localhost', () => {
    expect(listRemoteOrigins(5174, false, true)).toEqual(['https://localhost:5174']);
  });
});
