/**
 * The local transport against the live relay: Node's global WebSocket stands in for the
 * browser's, and `location` points at the relay's port. Real timers, since the 1 s retry
 * crosses real sockets.
 */
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket as WsSocket } from 'ws';
import { createLocalTransport } from '../../../src/services/remote/createLocalTransport';
import { attachRemoteRelay } from '../../../tools/utils/remote/attachRemoteRelay';
import type { RelayRoom } from '../../../src/@types/remote/RelayRoom';
import type { RemoteLink } from '../../../src/@types/remote/RemoteLink';
import type { RemoteLinkStatus } from '../../../src/@types/remote/RemoteLinkStatus';

const ROOM: RelayRoom = { code: 'ROOM0000', origin: 'https://10.0.0.2:5173', onSky: true };
// Past one reconnect delay, so a retry that should not happen would have.
const PAST_RETRY_MS = 1300;
// Generous: a full parallel suite run starves the socket round trips.
const WAIT = { timeout: 3000 };

const servers: Server[] = [];
const links: RemoteLink[] = [];
const peers: WsSocket[] = [];

afterEach(() => {
  for (const link of links.splice(0)) link.close();
  for (const peer of peers.splice(0)) peer.terminate();
  for (const server of servers.splice(0)) server.close();
  vi.unstubAllGlobals();
});

/** A relay on a free port, with every upgrade's target and socket recorded. */
async function startRelay() {
  const server = createServer();
  const handle = attachRemoteRelay(server, {
    codeFor: (last) => last ?? ROOM.code,
    mayHost: () => true,
    pairingOnSky: true,
    lanOrigin: () => ROOM.origin,
  });
  const upgrades: { target: string; socket: Socket }[] = [];
  server.on('upgrade', (request, socket: Socket) =>
    upgrades.push({ target: request.url ?? '', socket }),
  );
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  vi.stubGlobal('location', { protocol: 'http:', host: `localhost:${port}` });
  const targets = () => upgrades.map((upgrade) => upgrade.target);
  return { port, handle, upgrades, targets };
}

/** A peer socket outside the transport, open before this resolves. */
async function peer(port: number, path: string): Promise<WsSocket> {
  const socket = new WsSocket(`ws://localhost:${port}/__remote/${path}`);
  peers.push(socket);
  await new Promise((resolve) => socket.once('open', resolve));
  return socket;
}

function track<T extends RemoteLink>(link: T) {
  links.push(link);
  const texts: string[] = [];
  const statuses: RemoteLinkStatus[] = [];
  link.onText((text) => texts.push(text));
  link.onStatus((status) => statuses.push(status));
  return { link, texts, statuses };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('createLocalTransport', () => {
  it('host fires onRoom with the room frame and never passes it to onText', async () => {
    const { port } = await startRelay();
    const { link, texts } = track(createLocalTransport().host());
    const rooms: RelayRoom[] = [];
    link.onRoom((room) => rooms.push(room));
    await vi.waitFor(() => expect(rooms).toEqual([ROOM]), WAIT);
    const remote = await peer(port, ROOM.code);
    remote.send('{"from":"a","kind":"hello"}');
    await vi.waitFor(() => expect(texts).toEqual(['{"from":"a","kind":"hello"}']), WAIT);
  });

  it('host reconnects with last after the socket drops', async () => {
    const { upgrades, targets } = await startRelay();
    const { link } = track(createLocalTransport().host());
    const rooms: RelayRoom[] = [];
    link.onRoom((room) => rooms.push(room));
    await vi.waitFor(() => expect(rooms).toHaveLength(1), WAIT);
    upgrades[0]!.socket.destroy();
    await vi.waitFor(() => expect(rooms).toHaveLength(2), WAIT);
    expect(targets()).toEqual(['/__remote/host', `/__remote/host?last=${ROOM.code}`]);
  });

  it('host stops reconnecting after 4002', async () => {
    const { port, targets } = await startRelay();
    const { statuses } = track(createLocalTransport().host());
    await vi.waitFor(() => expect(statuses).toEqual(['open']), WAIT);
    await peer(port, 'host');
    await vi.waitFor(() => expect(statuses).toEqual(['open', 'closed']), WAIT);
    await pause(PAST_RETRY_MS);
    expect(targets()).toEqual(['/__remote/host', '/__remote/host']);
  });

  it('open stops reconnecting after 4001', async () => {
    const { port, handle, targets } = await startRelay();
    await peer(port, 'host');
    const { statuses } = track(createLocalTransport().open(ROOM.code));
    await vi.waitFor(() => expect(statuses).toEqual(['open']), WAIT);
    handle.rotate(ROOM.code, 'ROOM1111');
    await vi.waitFor(() => expect(statuses).toEqual(['open', 'closed']), WAIT);
    await pause(PAST_RETRY_MS);
    expect(targets()).toEqual(['/__remote/host', `/__remote/${ROOM.code}`]);
  });

  it('open keeps retrying a refused room until a host holds it', async () => {
    const { port } = await startRelay();
    const { statuses, texts } = track(createLocalTransport().open(ROOM.code));
    await vi.waitFor(() => expect(statuses).toEqual(['open', 'closed']), WAIT);
    const host = await peer(port, 'host');
    await vi.waitFor(() => expect(statuses).toEqual(['open', 'closed', 'open']), WAIT);
    // Only an admitted remote hears its host.
    host.send('{"kind":"menu"}');
    await vi.waitFor(() => expect(texts).toEqual(['{"kind":"menu"}']), WAIT);
  });
});
