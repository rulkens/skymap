import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { isLoopbackRequest } from '../../../../src/main/relay/utils/isLoopbackRequest';
import { listLanInterfaces } from '../../../../src/main/lan/utils/listLanInterfaces';

const from = (remoteAddress: string | undefined) =>
  ({ socket: { remoteAddress }, headers: { host: 'localhost' } }) as unknown as IncomingMessage;

describe('isLoopbackRequest', () => {
  it('accepts 127.0.0.1, ::1 and ::ffff:127.0.0.1', () => {
    expect(isLoopbackRequest(from('127.0.0.1'))).toBe(true);
    expect(isLoopbackRequest(from('::1'))).toBe(true);
    expect(isLoopbackRequest(from('::ffff:127.0.0.1'))).toBe(true);
  });

  it("rejects a LAN address, including this machine's own", () => {
    expect(isLoopbackRequest(from('192.168.1.20'))).toBe(false);
    expect(isLoopbackRequest(from('::ffff:192.168.1.20'))).toBe(false);
    expect(isLoopbackRequest(from(undefined))).toBe(false);
    for (const lan of listLanInterfaces()) expect(isLoopbackRequest(from(lan.address))).toBe(false);
  });
});
