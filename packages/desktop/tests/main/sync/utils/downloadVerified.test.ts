import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { downloadVerified } from '../../../../src/main/sync/utils/downloadVerified';

let server: Server;
let root: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'download-verified-'));
  // Sends the headers and a first chunk, then nothing: a socket that stalled mid-file.
  server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Length': '100' });
    res.write('partial');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(root, { recursive: true, force: true });
});

// Audit B I3: a stalled socket used to hold the sync for undici's 300 s body timeout.
it('gives up on a download that stops sending, and leaves no .part file', async () => {
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/x.bin`;
  const dest = join(root, 'x.bin');
  const started = Date.now();
  await expect(
    downloadVerified(url, dest, 'sha', 200, new AbortController().signal, () => {}),
  ).rejects.toThrow();
  expect(Date.now() - started).toBeLessThan(5000);
  expect(existsSync(`${dest}.part`)).toBe(false);
});
