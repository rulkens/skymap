import { describe, expect, it } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { serveTabletSetupRequest } from '../../../../src/main/server/utils/serveTabletSetupRequest';

const PAGE = Buffer.from('<p>setup</p>');
const CA = '-----BEGIN CERTIFICATE-----';

function serve(method: string, url: string) {
  const sent: { status?: number; headers?: Record<string, unknown>; body?: unknown } = {};
  const response = {
    writeHead: (status: number, headers?: Record<string, unknown>) => {
      Object.assign(sent, { status, headers });
      return response;
    },
    end: (body?: unknown) => void (sent.body = body),
  };
  serveTabletSetupRequest(
    { method, url } as IncomingMessage,
    response as never as ServerResponse,
    PAGE,
    CA,
  );
  return sent;
}

// Plain HTTP, so it must stay a page and a public certificate: nothing of the app or its data.
describe('serveTabletSetupRequest', () => {
  it('serves the setup page at the root, whatever the query', () => {
    expect(serve('GET', '/?from=qr')).toMatchObject({ status: 200, body: PAGE });
    expect(serve('GET', '/').headers).toMatchObject({ 'Content-Type': 'text/html; charset=utf-8' });
  });

  it('serves the CA certificate the tablet installs', () => {
    const sent = serve('GET', '/ca.crt');
    expect(sent).toMatchObject({ status: 200, body: Buffer.from(CA) });
    expect(sent.headers).toMatchObject({ 'Content-Type': 'application/x-x509-ca-cert' });
  });

  it('answers HEAD without a body', () => {
    expect(serve('HEAD', '/ca.crt')).toMatchObject({ status: 200, body: undefined });
  });

  it('has nothing else: the app, the data and the remote stay on HTTPS', () => {
    for (const url of ['/index.html', '/data/manifest.json', '/remote.html', '/../ca.crt']) {
      expect(serve('GET', url).status).toBe(404);
    }
    expect(serve('POST', '/').status).toBe(405);
  });
});
