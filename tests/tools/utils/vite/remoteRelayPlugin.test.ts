import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { attachRemoteRelay } from '../../../../tools/utils/vite/attachRemoteRelay';
import { listRemoteOrigins } from '../../../../tools/utils/vite/listRemoteOrigins';

const servers: Server[] = [];
const sockets: WebSocket[] = [];

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.terminate();
  for (const server of servers.splice(0)) server.close();
});

async function startRelay(): Promise<number> {
  const server = createServer();
  attachRemoteRelay(server);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return (server.address() as AddressInfo).port;
}

async function join(port: number, room: string): Promise<WebSocket> {
  const socket = new WebSocket(`ws://localhost:${port}/__remote/${room}`);
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return socket;
}

const collect = (socket: WebSocket): string[] => {
  const heard: string[] = [];
  socket.on('message', (data) => heard.push(data.toString()));
  return heard;
};
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 50));

describe('remote relay', () => {
  it('two sockets in one room hear each other and not themselves', async () => {
    const port = await startRelay();
    const a = await join(port, 'ROOM');
    const b = await join(port, 'ROOM');
    const heardA = collect(a);
    const heardB = collect(b);
    a.send('from a');
    b.send('from b');
    await settle();
    expect(heardA).toEqual(['from b']);
    expect(heardB).toEqual(['from a']);
  });

  it('a second room hears nothing', async () => {
    const port = await startRelay();
    const a = await join(port, 'ONE');
    const other = await join(port, 'TWO');
    const heard = collect(other);
    a.send('hello');
    await settle();
    expect(heard).toEqual([]);
  });

  it('an oversized message is dropped', async () => {
    const port = await startRelay();
    const a = await join(port, 'ROOM');
    const b = await join(port, 'ROOM');
    const heard = collect(b);
    a.send('x'.repeat(16385));
    a.send('small');
    await settle();
    expect(heard).toEqual(['small']);
  });

  it('a fifth socket is refused', async () => {
    const port = await startRelay();
    for (let i = 0; i < 4; i++) await join(port, 'ROOM');
    const fifth = await join(port, 'ROOM');
    const code = await new Promise<number>((resolve) => fifth.once('close', resolve));
    expect(code).toBe(1008);
  });
});

describe('listRemoteOrigins', () => {
  it('origins lists localhost last', () => {
    const origins = listRemoteOrigins(5174);
    expect(origins.at(-1)).toBe('http://localhost:5174');
    expect(origins.every((origin) => origin.endsWith(':5174'))).toBe(true);
  });
});
