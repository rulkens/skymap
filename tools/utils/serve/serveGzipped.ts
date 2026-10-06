import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createSecureServer } from 'node:http2';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';
import { shouldGzipOnWire } from '../../deploy/r2/shouldGzipOnWire';
import type { CertPair } from '../../@types/serve/CertPair';
import type { StaticServerHandle } from '../../@types/serve/StaticServerHandle';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
// Node's 10 MB default resets every stream (ENHANCE_YOUR_CALM) once the queued
// response bodies pass it, which a few concurrent catalog downloads do at once.
const H2_SESSION_MEMORY_MB = 1024;
const TEXT_EXTENSIONS: readonly string[] = ['.html', '.js', '.css', '.svg'];

/**
 * Serve `dir` on a free localhost port with production's wire sizes: the
 * shell's text assets gzipped as Cloudflare would, data files gzipped per the
 * R2 upload policy (`shouldGzipOnWire`). `vite preview` compresses nothing, so
 * a throttled load against it overstates every download by 2-3x. With `certs`
 * it speaks HTTP/2 over TLS as Cloudflare does (browsers only negotiate h2 over
 * TLS); without, HTTP/1.1, whose six-connection limit queues the chunks.
 * `port` 0 picks a free one.
 */
export async function serveGzipped(
  dir: string,
  certs: CertPair | undefined,
  port: number,
): Promise<StaticServerHandle> {
  const gzipped = new Map<string, Buffer>();
  const handle = (req: IncomingMessage, res: ServerResponse): void => {
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0] as string));
    const file = join(dir, path.endsWith('/') ? `${path}index.html` : path);
    let size: number;
    try {
      size = statSync(file).size;
    } catch {
      res.writeHead(404).end();
      return;
    }
    const ext = extname(file);
    res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
    if (TEXT_EXTENSIONS.includes(ext) || shouldGzipOnWire(file)) {
      let body = gzipped.get(file);
      if (body === undefined) {
        body = gzipSync(readFileSync(file), { level: 6 });
        gzipped.set(file, body);
      }
      res.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Length': body.byteLength });
      res.end(body);
      return;
    }
    res.writeHead(200, { 'Content-Length': size });
    createReadStream(file).pipe(res);
  };
  // The compat API hands an h2 stream the same request/response shape.
  const server =
    certs === undefined
      ? createServer(handle)
      : createSecureServer(
          { ...certs, allowHTTP1: true, maxSessionMemory: H2_SESSION_MEMORY_MB },
          handle as never,
        );
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const bound = (server.address() as AddressInfo).port;
  return {
    url: `${certs === undefined ? 'http' : 'https'}://localhost:${bound}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
