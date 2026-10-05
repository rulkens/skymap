import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';
import { shouldGzipOnWire } from '../../deploy/r2/shouldGzipOnWire';
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
const TEXT_EXTENSIONS: readonly string[] = ['.html', '.js', '.css', '.svg'];

/**
 * Serve `dir` on a free localhost port with production's wire sizes: the
 * shell's text assets gzipped as Cloudflare would, data files gzipped per the
 * R2 upload policy (`shouldGzipOnWire`). `vite preview` compresses nothing, so
 * a throttled load against it overstates every download by 2-3x.
 */
export async function serveGzipped(dir: string): Promise<StaticServerHandle> {
  const gzipped = new Map<string, Buffer>();
  const server = createServer((req, res) => {
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
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://localhost:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
