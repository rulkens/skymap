import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { AppRoots } from '../@types/AppRoots';
import { CONTENT_TYPE_BY_EXTENSION } from '../data/contentTypeByExtension';
import { resolveAppPath } from '../resolveAppPath';
import { isUnderARoot } from './isUnderARoot';

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
  response.writeHead(200, {
    'Content-Type': CONTENT_TYPE_BY_EXTENSION[extname(target)] ?? 'application/octet-stream',
    'Content-Length': info.size,
    // A sync replaces the manifest under the same name; "Restart sky" must see the new one.
    'Cache-Control': 'no-cache',
  });
  if (request.method === 'HEAD') response.end();
  else await pipeline(createReadStream(target), response);
}
