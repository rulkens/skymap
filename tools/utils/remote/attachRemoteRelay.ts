/**
 * The remote relay. A dome hosts at `/__remote/host` and the relay issues its room code; remotes
 * join `/__remote/<code>` only while a live host holds that code. Remote text reaches the host,
 * host text reaches the remotes. Only `/__remote/` upgrades are claimed, so Vite's HMR socket still
 * reaches its handler. A heartbeat ping ends sockets that stopped answering (a phone asleep or off
 * the Wi-Fi), which would otherwise hold a room slot forever.
 */
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import type { RelayFrame } from '../../../src/@types/remote/RelayFrame';
import type { RelayRoom } from '../../../src/@types/remote/RelayRoom';
import type { RoomCode } from '../../../src/@types/remote/RoomCode';
import { HOST_REPLACED_CLOSE_CODE } from '../../../src/data/remote/hostReplacedCloseCode';
import { ROOM_ROTATED_CLOSE_CODE } from '../../../src/data/remote/roomRotatedCloseCode';
import type { RelayHandle } from '../../@types/remote/RelayHandle';
import type { RelayOptions } from '../../@types/remote/RelayOptions';

const REMOTE_PATH_PREFIX = '/__remote/';
const HOST_PATH = `${REMOTE_PATH_PREFIX}host`;
const MAX_MESSAGE_BYTES = 16384;
const MAX_SOCKETS_PER_ROOM = 4;
const POLICY_VIOLATION = 1008;
const HEARTBEAT_INTERVAL_MS = 10_000;

export function attachRemoteRelay(server: Server, options: RelayOptions): RelayHandle {
  const wss = new WebSocketServer({ noServer: true });
  const hostOf = new Map<RoomCode, WebSocket>();
  const codeOf = new Map<WebSocket, RoomCode>();
  const remotesOf = new Map<RoomCode, Set<WebSocket>>();
  const listeners = new Set<(room: RelayRoom) => void>();
  const alive = new WeakSet<WebSocket>();
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, options.heartbeatMs ?? HEARTBEAT_INTERVAL_MS);
  server.on('close', () => clearInterval(heartbeat));

  const announce = (host: WebSocket, code: RoomCode): void => {
    const room: RelayRoom = { code, origin: options.lanOrigin(), onSky: options.pairingOnSky };
    const frame: RelayFrame = { relay: 'room', ...room };
    host.send(JSON.stringify(frame));
    for (const listener of listeners) listener(room);
  };

  // A remote must not pass itself off as the relay to the host.
  const forgesRelayFrame = (text: string): boolean => {
    try {
      const parsed: unknown = JSON.parse(text);
      return typeof parsed === 'object' && parsed !== null && 'relay' in parsed;
    } catch {
      return false;
    }
  };

  const track = (ws: WebSocket, onText: (text: string) => void): void => {
    alive.add(ws);
    ws.on('pong', () => alive.add(ws));
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      const text = data.toString();
      if (Buffer.byteLength(text) <= MAX_MESSAGE_BYTES) onText(text);
    });
  };

  const host = (ws: WebSocket, code: RoomCode): void => {
    hostOf.get(code)?.close(HOST_REPLACED_CLOSE_CODE);
    hostOf.set(code, ws);
    codeOf.set(ws, code);
    if (!remotesOf.has(code)) remotesOf.set(code, new Set());
    track(ws, (text) => {
      const current = codeOf.get(ws);
      if (current === undefined || hostOf.get(current) !== ws) return;
      for (const remote of remotesOf.get(current) ?? []) remote.send(text);
    });
    ws.on('close', () => {
      const current = codeOf.get(ws);
      codeOf.delete(ws);
      // A replaced host leaves its room to the newer host.
      if (current === undefined || hostOf.get(current) !== ws) return;
      hostOf.delete(current);
      for (const remote of remotesOf.get(current) ?? []) remote.close(POLICY_VIOLATION);
      remotesOf.delete(current);
    });
    announce(ws, code);
  };

  const kickRemotes = (code: RoomCode): void => {
    for (const remote of remotesOf.get(code) ?? []) remote.close(ROOM_ROTATED_CLOSE_CODE);
    remotesOf.delete(code);
  };

  const join = (ws: WebSocket, code: RoomCode): void => {
    const remotes = remotesOf.get(code);
    if (!hostOf.has(code) || remotes === undefined || remotes.size + 1 >= MAX_SOCKETS_PER_ROOM) {
      ws.close(POLICY_VIOLATION);
      return;
    }
    remotes.add(ws);
    track(ws, (text) => {
      if (!forgesRelayFrame(text)) hostOf.get(code)?.send(text);
    });
    ws.on('close', () => remotes.delete(ws));
  };

  // Never throw here: an absolute-form target like `http://[bad/…` would end the process.
  server.on('upgrade', (request, socket, head) => {
    const target = request.url ?? '';
    const queryAt = target.indexOf('?');
    const path = queryAt < 0 ? target : target.slice(0, queryAt);
    if (!path.startsWith(REMOTE_PATH_PREFIX)) return;
    wss.handleUpgrade(request, socket, head, (ws) => {
      // Before any close: a refused peer's bad frame would otherwise throw uncaught.
      ws.on('error', () => {});
      if (path !== HOST_PATH) return join(ws, path.slice(REMOTE_PATH_PREFIX.length));
      if (!options.mayHost(request)) return ws.close(POLICY_VIOLATION);
      const last = new URLSearchParams(queryAt < 0 ? '' : target.slice(queryAt + 1)).get('last');
      host(ws, options.codeFor(last || null));
    });
  });

  return {
    rotate: (from, to) => {
      const ws = hostOf.get(from);
      hostOf.delete(from);
      kickRemotes(from);
      if (ws === undefined) return;
      // Rotating onto a held code replaces that code's host, as a newer host would.
      hostOf.get(to)?.close(HOST_REPLACED_CLOSE_CODE);
      kickRemotes(to);
      hostOf.set(to, ws);
      codeOf.set(ws, to);
      remotesOf.set(to, new Set());
      announce(ws, to);
    },
    onRoom: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
