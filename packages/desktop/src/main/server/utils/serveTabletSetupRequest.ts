import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The plain-HTTP side: the tablet setup page at `/`, the CA at `/ca.crt` and the guide's pictures at
 * `/guide/<name>.webp`, all public, so a tablet meets no certificate warning before it trusts one.
 * Pictures come only from `guide`, read at start, so no path reaches the disk. Everything else is 404.
 */
export function serveTabletSetupRequest(
  request: IncomingMessage,
  response: ServerResponse,
  page: Buffer,
  caPem: string,
  guide: ReadonlyMap<string, Buffer>,
): void {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const path = (request.url ?? '/').split('?')[0] ?? '/';
  const picture = guide.get(path);
  const [type, body] =
    path === '/'
      ? ['text/html; charset=utf-8', page]
      : path === '/ca.crt'
        ? ['application/x-x509-ca-cert', Buffer.from(caPem)]
        : picture !== undefined
          ? ['image/webp', picture]
          : [null, null];
  if (type === null || body === null) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': type,
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}
