import type { IncomingMessage } from 'node:http';

/** Reads a request body as raw bytes — the multipart/octet-stream upload path. */
export function readBinaryBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((res, rej) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => res(Buffer.concat(chunks)));
    req.on('error', rej);
  });
}
