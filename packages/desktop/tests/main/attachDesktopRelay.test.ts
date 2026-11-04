import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { RelayHandle } from '../../../../tools/@types/remote/RelayHandle.js';
import { attachDesktopRelay } from '../../src/main/attachDesktopRelay.js';
import { ensureLanCertificate } from '../../src/main/ensureLanCertificate.js';
import { readRoomCode } from '../../src/main/readRoomCode.js';
import { rotateRoomCode } from '../../src/main/rotateRoomCode.js';
import { startAppServer } from '../../src/main/startAppServer.js';
import { listLanInterfaces } from '../../src/utils/listLanInterfaces.js';

// The real app server (HTTPS on every interface) with the relay on it, as main.ts wires them.
let userData: string;
let app: Awaited<ReturnType<typeof startAppServer>>;
let relay: RelayHandle;
let code: string;
let ca: string;
const sockets: WebSocket[] = [];

beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'desktop-relay-'));
  const tls = await ensureLanCertificate(join(userData, 'certs'), {
    hostnames: ['localhost'],
    ips: ['127.0.0.1', ...listLanInterfaces().map((lan) => lan.address)],
  });
  ca = tls.ca;
  app = await startAppServer({ dist: userData, data: userData, caPem: ca }, tls, 0);
  code = await readRoomCode(userData);
  relay = attachDesktopRelay(app.server, { code: () => code, network: () => null });
});
afterEach(() => sockets.splice(0).forEach((socket) => socket.terminate()));
afterAll(async () => {
  await app.close();
  rmSync(userData, { recursive: true, force: true });
});

function open(path: string, host = '127.0.0.1') {
  const { port } = app.server.address() as AddressInfo;
  const socket = new WebSocket(`wss://${host}:${port}/__remote/${path}`, { ca });
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
