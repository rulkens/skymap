import type { IncomingMessage } from 'node:http';

/** Reads a request body as JSON. An empty body parses as `{}` rather than
 *  throwing — most POST routes here have no required fields. */
export function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((res, rej) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      try {
        res(body.length > 0 ? JSON.parse(body) : {});
      } catch (err) {
        rej(err);
      }
    });
    req.on('error', rej);
  });
}
