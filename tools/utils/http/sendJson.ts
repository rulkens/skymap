import type { ServerResponse } from 'node:http';

/** Writes a JSON response body with the matching status and content type. */
export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}
