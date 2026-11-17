import type { IncomingMessage } from 'node:http';

// The socket's peer, never a header: a client can claim any Host or X-Forwarded-For.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** True for a request from this machine over loopback; its own LAN address does not count. */
export function isLoopbackRequest(request: IncomingMessage): boolean {
  return LOOPBACK.has(request.socket.remoteAddress ?? '');
}
