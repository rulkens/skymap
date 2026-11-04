import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ensureCa } from '../../../src/main/certificates/ensureCa';
import { ensureLeaf } from '../../../src/main/certificates/ensureLeaf';
import { startAppServer } from '../../../src/main/server/startAppServer';

// Over the wire, so a server that normalises the URL before resolveAppPath sees it fails here.
let root: string;
let app: Awaited<ReturnType<typeof startAppServer>>;
let ca: string;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'app-server-'));
  for (const dir of ['dist', 'data', 'certs']) mkdirSync(join(root, dir));
  writeFileSync(join(root, 'dist/index.html'), '<html>sky</html>');
  writeFileSync(join(root, 'data/manifest.json'), '{}');
  writeFileSync(join(root, 'secret.txt'), 'secret');
  symlinkSync(join(root, 'secret.txt'), join(root, 'data/link.txt'));
  symlinkSync(join(root, 'data/manifest.json'), join(root, 'data/alias.json'));
  const certDir = join(root, 'certs');
  const tls = await ensureLeaf(certDir, await ensureCa(certDir), {
    hostnames: ['localhost'],
    ips: [],
  });
  ca = tls.ca;
  const roots = { dist: join(root, 'dist'), data: join(root, 'data'), caPem: tls.ca };
  app = await startAppServer(roots, tls, 0);
});
afterAll(async () => {
  await app.close();
  rmSync(root, { recursive: true, force: true });
});

function get(path: string): Promise<{ status: number; type: string; body: string }> {
  const { port } = app.server.address() as AddressInfo;
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', servername: 'localhost', port, path, ca }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, type: res.headers['content-type'] ?? '', body }),
      );
    });
    req.on('error', reject);
    req.end();
  });
}

describe('startAppServer', () => {
  it('serves dist, data and the CA to a client that trusts only the CA', async () => {
    expect(await get('/?dome&remote')).toMatchObject({ status: 200, body: '<html>sky</html>' });
    expect(await get('/data/manifest.json')).toMatchObject({ status: 200, body: '{}' });
    expect(await get('/ca.crt')).toMatchObject({ type: 'application/x-x509-ca-cert', body: ca });
  });

  it('answers 404 to every escape attempt', async () => {
    for (const path of [
      '/data/../index.html',
      '/data/%2e%2e/index.html',
      '/%2e%2e/secret.txt',
      '/..%5csecret.txt',
      '/data/%00',
      '/%E0%A4%A',
    ]) {
      expect((await get(path)).status, path).toBe(404);
    }
  });

  it('follows a symlink only while it stays inside a root', async () => {
    expect((await get('/data/link.txt')).status).toBe(404);
    expect(await get('/data/alias.json')).toMatchObject({ status: 200, body: '{}' });
  });

  it('outlives a server error after listening', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => app.server.emit('error', new Error('EMFILE'))).not.toThrow();
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
    expect((await get('/')).status).toBe(200);
  });
});
