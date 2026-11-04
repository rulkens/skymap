import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { connect } from 'node:tls';
import { WebSocket } from 'ws';
import type { RelayHandle } from '../../../../../tools/@types/remote/RelayHandle';
import { attachDesktopRelay } from '../../../src/main/relay/attachDesktopRelay';
import { APP_ORIGIN } from '../../../src/main/server/data/appOrigin';
import { ensureCa } from '../../../src/main/certificates/ensureCa';
import { ensureLeaf } from '../../../src/main/certificates/ensureLeaf';
import { readRoomCode } from '../../../src/main/relay/readRoomCode';
import { rotateRoomCode } from '../../../src/main/relay/rotateRoomCode';
import { startAppServer } from '../../../src/main/server/startAppServer';
import { listLanInterfaces } from '../../../src/main/lan/utils/listLanInterfaces';

// The real app server (HTTPS on every interface) with the relay on it, as main.ts wires them.
let userData: string;
let server: Server;
let relay: RelayHandle;
let code: string;
let ca: string;
const sockets: WebSocket[] = [];

beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'desktop-relay-'));
  const certDir = join(userData, 'certs');
  const tls = await ensureLeaf(certDir, await ensureCa(certDir), {
    hostnames: ['localhost'],
    ips: ['127.0.0.1', ...listLanInterfaces().map((lan) => lan.address)],
  });
  ca = tls.ca;
  server = await startAppServer({ dist: userData, data: userData, caPem: ca }, tls, 0);
  code = await readRoomCode(userData);
  relay = attachDesktopRelay(server, { code: () => code, network: () => null });
});
afterEach(() => sockets.splice(0).forEach((socket) => socket.terminate()));
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve).closeAllConnections());
  rmSync(userData, { recursive: true, force: true });
});

const port = () => (server.address() as AddressInfo).port;

function open(path: string, host = '127.0.0.1', origin: string | null = APP_ORIGIN) {
  const socket = new WebSocket(`wss://${host}:${port()}/__remote/${path}`, {
    ca,
    origin: origin ?? undefined,
  });
  sockets.push(socket);
  const frames: unknown[] = [];
  let onFrame = () => {};
  socket.on('message', (data) => {
    frames.push(JSON.parse(data.toString()));
    onFrame();
  });
  const nextFrame = (count: number) =>
    new Promise<unknown>((resolve) => {
      onFrame = () => frames.length >= count && resolve(frames[count - 1]);
      onFrame();
    });
  const closed = new Promise<number>((resolve) => socket.once('close', resolve));
  const opened = new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return { nextFrame, closed, opened };
}

describe('attachDesktopRelay', () => {
  it('a loopback host receives the stored code with onSky false', async () => {
    const host = open('host');
    expect(await host.nextFrame(1)).toMatchObject({ relay: 'room', code, onSky: false });
  });

  const lan = listLanInterfaces()[0];
  it.skipIf(lan === undefined)(
    "a host from this machine's own LAN address is refused",
    async () => {
      const host = open('host', lan!.address);
      expect(await host.closed).toBe(1008);
    },
  );

  it('a loopback host from any other page is refused', async () => {
    expect(await open('host', '127.0.0.1', 'https://evil.example').closed).toBe(1008);
    expect(await open('host', '127.0.0.1', null).closed).toBe(1008);
  });

  it('an upgrade outside /__remote/ is closed and the server keeps serving', async () => {
    const socket = connect({ host: '127.0.0.1', port: port(), ca }, () =>
      socket.write(
        'GET /foo HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n',
      ),
    );
    const closedWithin = await Promise.race([
      new Promise((resolve) => socket.once('close', () => resolve('closed'))),
      new Promise((resolve) => setTimeout(() => resolve('still open'), 1000)),
    ]);
    socket.destroy();
    expect(closedWithin).toBe('closed');
    expect(await open('host').nextFrame(1)).toMatchObject({ code });
  });

  it('a join to another code is refused with 1008', async () => {
    const host = open('host');
    await host.nextFrame(1);
    expect(await open('ZZZZZZZZ').closed).toBe(1008);
  });

  it('rotateRoomCode kicks remotes with 4001 and the host hears the new code', async () => {
    const host = open('host');
    await host.nextFrame(1);
    const remote = open(code);
    await remote.opened;
    const old = code;
    code = await rotateRoomCode(userData, relay, old);
    expect(code).not.toBe(old);
    expect(await remote.closed).toBe(4001);
    expect(await host.nextFrame(2)).toMatchObject({ relay: 'room', code, onSky: false });
    expect(await readRoomCode(userData)).toBe(code);
    await open(code).opened;
    expect(await open('host').nextFrame(1)).toMatchObject({ code });
  });
});
