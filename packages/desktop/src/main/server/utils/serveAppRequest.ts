import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { AppRoots } from '../@types/AppRoots';
import { CONTENT_TYPE_BY_EXTENSION } from '../data/contentTypeByExtension';
import { resolveAppPath } from '../resolveAppPath';
import { isUnderARoot } from './isUnderARoot';
import { parseByteRange } from './parseByteRange';

/** Answers one GET or HEAD from the web build, the data mirror or /ca.crt; anything else is 404 or 405. */
export async function serveAppRequest(
  request: IncomingMessage,
  response: ServerResponse,
  roots: AppRoots,
): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const target = resolveAppPath(request.url ?? '/', roots);
  if (target === 'ca') {
    const body = Buffer.from(roots.caPem);
    response.writeHead(200, {
      'Content-Type': 'application/x-x509-ca-cert',
      'Content-Length': body.length,
    });
    response.end(request.method === 'HEAD' ? undefined : body);
    return;
  }
  const info = target === null ? null : await stat(target).catch(() => null);
  if (target === null || !info?.isFile() || !(await isUnderARoot(target, roots))) {
    response.writeHead(404).end();
    return;
  }
  // The surface tiles are packs the app reads one tile at a time with a Range request.
  const range = parseByteRange(request.headers.range, info.size);
  if (range === 'unsatisfiable') {
    response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
    return;
  }
  const span = range ?? { start: 0, end: info.size - 1 };
  response.writeHead(range === null ? 200 : 206, {
    'Content-Type': CONTENT_TYPE_BY_EXTENSION[extname(target)] ?? 'application/octet-stream',
    'Content-Length': span.end - span.start + 1,
    'Accept-Ranges': 'bytes',
    ...(range === null ? {} : { 'Content-Range': `bytes ${span.start}-${span.end}/${info.size}` }),
    // A sync replaces the manifest under the same name; "Restart sky" must see the new one.
    'Cache-Control': 'no-cache',
  });
  if (request.method === 'HEAD' || info.size === 0) response.end();
  else await pipeline(createReadStream(target, span), response);
}
