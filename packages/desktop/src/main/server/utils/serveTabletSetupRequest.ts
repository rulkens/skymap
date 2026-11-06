import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The plain-HTTP side: the tablet setup page at `/` and the CA at `/ca.crt`, both public, so a tablet
 * meets no certificate warning before it trusts one. Everything else is 404 and stays on HTTPS.
 */
export function serveTabletSetupRequest(
  request: IncomingMessage,
  response: ServerResponse,
  page: Buffer,
  caPem: string,
): void {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const path = (request.url ?? '/').split('?')[0];
  const [type, body] =
    path === '/'
      ? ['text/html; charset=utf-8', page]
      : path === '/ca.crt'
        ? ['application/x-x509-ca-cert', Buffer.from(caPem)]
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
