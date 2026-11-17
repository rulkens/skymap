import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { connect } from 'node:net';
import type { AddressInfo, Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { RelayOptions } from '../../../../tools/@types/remote/RelayOptions';
import type { RelayRoom } from '../../../../src/@types/remote/RelayRoom';
import { attachRemoteRelay } from '../../../../tools/utils/remote/attachRemoteRelay';

const servers: Server[] = [];
const sockets: WebSocket[] = [];
const rawSockets: Socket[] = [];

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.terminate();
  for (const raw of rawSockets.splice(0)) raw.destroy();
  for (const server of servers.splice(0)) server.close();
});

async function startRelay(options: Partial<RelayOptions> = {}) {
  const server = createServer();
  const handle = attachRemoteRelay(server, {
    codeFor: (last) => last ?? 'ROOM0000',
    mayHost: () => true,
    pairingOnSky: true,
    lanOrigin: () => 'https://10.0.0.2:5173',
    ...options,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return { port: (server.address() as AddressInfo).port, handle };
}

/** Opens a socket and keeps every text it hears from the moment it connects. */
async function open(port: number, path: string, autoPong = true) {
  const socket = new WebSocket(`ws://localhost:${port}/__remote/${path}`, { autoPong });
  sockets.push(socket);
  const heard: string[] = [];
  socket.on('message', (data) => heard.push(data.toString()));
  const closed = new Promise<number>((resolve) => socket.once('close', resolve));
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return { socket, heard, closed };
}

/** A hand-written upgrade request, for targets and frames a well-behaved client never sends. */
async function rawUpgrade(port: number, target: string): Promise<Socket> {
  const raw = connect(port, '127.0.0.1');
  rawSockets.push(raw);
  await new Promise((resolve) => raw.once('connect', resolve));
  raw.write(
    `GET ${target} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n',
  );
  return raw;
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 50));
const frame = (code: string) =>
  JSON.stringify({ relay: 'room', code, origin: 'https://10.0.0.2:5173', onSky: true });

describe('attachRemoteRelay', () => {
  it('a host receives a room frame on joining', async () => {
    const { port } = await startRelay();
    const host = await open(port, 'host');
    await settle();
    expect(host.heard.map((text) => JSON.parse(text))).toEqual([
      { relay: 'room', code: 'ROOM0000', origin: 'https://10.0.0.2:5173', onSky: true },
    ]);
  });

  it('a host reconnecting with last keeps its code', async () => {
    const asked: (string | null)[] = [];
    const { port } = await startRelay({ codeFor: (last) => (asked.push(last), last ?? 'X') });
    const host = await open(port, 'host?last=ABCD2345');
    await settle();
    expect(asked).toEqual(['ABCD2345']);
    expect(host.heard).toEqual([frame('ABCD2345')]);
  });

  it('remote text reaches the host and host text reaches every remote', async () => {
    const { port } = await startRelay();
    const host = await open(port, 'host');
    const a = await open(port, 'ROOM0000');
    const b = await open(port, 'ROOM0000');
    a.socket.send('from a');
    host.socket.send('from host');
    await settle();
    expect(host.heard).toEqual([frame('ROOM0000'), 'from a']);
    expect(a.heard).toEqual(['from host']);
    expect(b.heard).toEqual(['from host']);
  });

  it('a join to a code no host holds is refused with 1008', async () => {
    const { port } = await startRelay();
    await open(port, 'host');
    const stray = await open(port, 'NOPE2345');
    expect(await stray.closed).toBe(1008);
  });

  it('a remote retrying after its host left joins once a host holds the code again', async () => {
    const { port } = await startRelay();
    const host = await open(port, 'host?last=ABCD2345');
    const remote = await open(port, 'ABCD2345');
    host.socket.close();
    expect(await remote.closed).toBe(1008);
    const early = await open(port, 'ABCD2345');
    expect(await early.closed).toBe(1008);
    await open(port, 'host?last=ABCD2345');
    const retry = await open(port, 'ABCD2345');
    await settle();
    expect(retry.socket.readyState).toBe(WebSocket.OPEN);
  });

  it("a remote's text with a relay key never reaches the host", async () => {
    const { port } = await startRelay();
    const host = await open(port, 'host');
    const remote = await open(port, 'ROOM0000');
    remote.socket.send(JSON.stringify({ relay: 'room', code: 'EVIL0000' }));
    remote.socket.send(JSON.stringify({ kind: 'hello' }));
    await settle();
    expect(host.heard).toEqual([frame('ROOM0000'), JSON.stringify({ kind: 'hello' })]);
  });

  it('a newer host replaces the older one with 4002', async () => {
    const { port } = await startRelay();
    const older = await open(port, 'host');
    const remote = await open(port, 'ROOM0000');
    const newer = await open(port, 'host');
    expect(await older.closed).toBe(4002);
    remote.socket.send('still paired');
    await settle();
    expect(newer.heard).toEqual([frame('ROOM0000'), 'still paired']);
  });

  it('a host is refused with 1008 when mayHost says no', async () => {
    const { port } = await startRelay({ mayHost: () => false });
    const host = await open(port, 'host');
    expect(await host.closed).toBe(1008);
    expect(host.heard).toEqual([]);
  });

  it("rotate closes the old room's remotes with 4001 and sends the host a new room frame", async () => {
    const { port, handle } = await startRelay();
    const host = await open(port, 'host');
    const remote = await open(port, 'ROOM0000');
    handle.rotate('ROOM0000', 'NEWC0DE1');
    expect(await remote.closed).toBe(4001);
    const stale = await open(port, 'ROOM0000');
    expect(await stale.closed).toBe(1008);
    const fresh = await open(port, 'NEWC0DE1');
    fresh.socket.send('after rotate');
    await settle();
    expect(host.socket.readyState).toBe(WebSocket.OPEN);
    expect(host.heard).toEqual([frame('ROOM0000'), frame('NEWC0DE1'), 'after rotate']);
  });

  it('onRoom listeners hear the first room and every rotation', async () => {
    const { port, handle } = await startRelay();
    const rooms: RelayRoom[] = [];
    handle.onRoom((room) => rooms.push(room));
    await open(port, 'host');
    await settle();
    handle.rotate('ROOM0000', 'NEWC0DE1');
    expect(rooms.map((room) => room.code)).toEqual(['ROOM0000', 'NEWC0DE1']);
  });

  it('an oversized message is dropped', async () => {
    const { port } = await startRelay();
    const host = await open(port, 'host');
    const remote = await open(port, 'ROOM0000');
    remote.socket.send('x'.repeat(16385));
    remote.socket.send('small');
    await settle();
    expect(host.heard).toEqual([frame('ROOM0000'), 'small']);
  });

  it('a fifth socket is refused and the first four stay open', async () => {
    const { port } = await startRelay();
    const first = [await open(port, 'host')];
    for (let i = 0; i < 3; i++) first.push(await open(port, 'ROOM0000'));
    const fifth = await open(port, 'ROOM0000');
    expect(await fifth.closed).toBe(1008);
    await settle();
    expect(first.map(({ socket }) => socket.readyState)).toEqual(Array(4).fill(WebSocket.OPEN));
  });

  it('an empty last asks codeFor for a fresh code', async () => {
    const asked: (string | null)[] = [];
    const { port } = await startRelay({ codeFor: (last) => (asked.push(last), 'ROOM0000') });
    await open(port, 'host?last=');
    expect(asked).toEqual([null]);
  });

  it('rotate onto a code a live host holds replaces that host and kicks its remotes', async () => {
    const { port, handle } = await startRelay();
    const moving = await open(port, 'host');
    const holder = await open(port, 'host?last=TAKEN000');
    const holderRemote = await open(port, 'TAKEN000');
    handle.rotate('ROOM0000', 'TAKEN000');
    expect(await holder.closed).toBe(4002);
    expect(await holderRemote.closed).toBe(4001);
    const fresh = await open(port, 'TAKEN000');
    fresh.socket.send('to the mover');
    await settle();
    expect(moving.heard).toEqual([frame('ROOM0000'), frame('TAKEN000'), 'to the mover']);
  });

  it('a refused socket that then sends an invalid frame leaves the relay running', async () => {
    const { port } = await startRelay();
    const raw = await rawUpgrade(port, '/__remote/NOPE2345');
    await new Promise((resolve) => raw.once('data', resolve));
    raw.write(Buffer.from([0x83, 0x00]));
    await settle();
    const host = await open(port, 'host');
    await settle();
    expect(host.heard).toEqual([frame('ROOM0000')]);
  });

  it('an unparseable absolute-form target leaves the relay running', async () => {
    const { port } = await startRelay();
    await rawUpgrade(port, 'http://[bad/__remote/x');
    await settle();
    const host = await open(port, 'host');
    await settle();
    expect(host.heard).toEqual([frame('ROOM0000')]);
  });

  it('a socket that stops answering pings is dropped and frees its slot', async () => {
    const { port } = await startRelay({ heartbeatMs: 30 });
    await open(port, 'host');
    const asleep = await open(port, 'ROOM0000', false);
    for (let i = 0; i < 2; i++) await open(port, 'ROOM0000');
    await asleep.closed;
    const fourth = await open(port, 'ROOM0000');
    await settle();
    expect(fourth.socket.readyState).toBe(WebSocket.OPEN);
  });
});
