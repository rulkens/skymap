import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:tls';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureLanCertificate } from '../../src/main/ensureLanCertificate';
import { renewServerCertificate } from '../../src/main/renewServerCertificate';
import { startAppServer } from '../../src/main/startAppServer';

// 127.0.0.1 stands in for a LAN address the machine gained after launch (a DHCP change).
let root: string;
let app: Awaited<ReturnType<typeof startAppServer>>;
const certDir = () => join(root, 'certs');
const before = { hostnames: ['localhost'], ips: [] };

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'renew-'));
  const tls = await ensureLanCertificate(certDir(), before);
  app = await startAppServer({ dist: root, data: root, caPem: tls.ca }, tls, 0);
});
afterAll(async () => {
  await app.close();
  rmSync(root, { recursive: true, force: true });
});

/** Whether a client that trusts only the CA accepts the server by this IP. */
function trustedAt(ip: string, ca: string): Promise<boolean> {
  const { port } = app.server.address() as AddressInfo;
  return new Promise((resolve) => {
    const socket = connect({ host: ip, port, ca }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

describe('renewServerCertificate', () => {
  it('serves a reissued leaf naming a new address without a restart', async () => {
    const current = await ensureLanCertificate(certDir(), before);
    expect(await trustedAt('127.0.0.1', current.ca)).toBe(false);
    const after = { ...before, ips: ['127.0.0.1'] };
    const renewed = await renewServerCertificate(app.server, certDir(), after, current);
    expect(renewed.cert).not.toBe(current.cert);
    expect(renewed.ca).toBe(current.ca);
    expect(await trustedAt('127.0.0.1', current.ca)).toBe(true);
  });
});
