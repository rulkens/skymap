import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runSync } from '../../src/sync/runSync';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const A = Buffer.from('alpha');
const B = Buffer.from('bravo');
const C = Buffer.from('charlie');

let server: Server;
let baseUrl: string;
let root: string;
let objects: Record<string, Buffer>;
let inventoryBody: object;
let failPath: string | null;
let lyingSha: string | null;
let requests: string[];

const entry = (key: string, bytes: Buffer) => ({ key, size: bytes.length, sha256: sha(bytes) });
const run = () => runSync({ baseUrl, dataRoot: root, onProgress: () => {} });

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'run-sync-'));
  objects = { '/data/g1/a.bin': A, '/data/g2/b.bin': B, '/data/g2/c.bin': C };
  inventoryBody = {
    groups: [
      { label: 'one', files: [entry('data/g1/a.bin', A)] },
      { label: 'two', files: [entry('data/g2/b.bin', B), entry('data/g2/c.bin', C)] },
    ],
  };
  failPath = null;
  lyingSha = null;
  requests = [];
  server = createServer((req, res) => {
    const path = req.url ?? '';
    requests.push(path);
    if (path === '/data/offline-inventory.json') {
      res.end(JSON.stringify(inventoryBody));
    } else if (path === failPath) {
      res.statusCode = 500;
      res.end();
    } else if (objects[path]) {
      res.end(path === lyingSha ? Buffer.from('tampered') : objects[path]);
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  await new Promise((r) => server.close(r));
  rmSync(root, { recursive: true, force: true });
});

describe('runSync', () => {
  it('first run downloads every file, writes synced.json, then inventory.json', async () => {
    expect(await run()).toBe('synced');
    expect(readFileSync(join(root, 'g2/c.bin'))).toEqual(C);
    expect(JSON.parse(readFileSync(join(root, 'synced.json'), 'utf8'))).toEqual({
      'data/g1/a.bin': sha(A),
      'data/g2/b.bin': sha(B),
      'data/g2/c.bin': sha(C),
    });
    expect(JSON.parse(readFileSync(join(root, 'inventory.json'), 'utf8'))).toEqual(inventoryBody);
  });

  it('second run downloads nothing', async () => {
    await run();
    requests = [];
    expect(await run()).toBe('synced');
    expect(requests).toEqual(['/data/offline-inventory.json']);
  });

  it('a mid-group 500 returns failed and leaves the previous inventory.json', async () => {
    writeFileSync(join(root, 'inventory.json'), '{"groups":[]}');
    failPath = '/data/g2/c.bin';
    expect(await run()).toBe('failed');
    expect(readFileSync(join(root, 'inventory.json'), 'utf8')).toBe('{"groups":[]}');
  });

  it('the next run resumes and completes', async () => {
    failPath = '/data/g2/c.bin';
    await run();
    failPath = null;
    requests = [];
    expect(await run()).toBe('synced');
    expect(requests).not.toContain('/data/g1/a.bin');
    expect(readFileSync(join(root, 'g2/c.bin'))).toEqual(C);
  });

  it('a sha mismatch returns failed and leaves no renamed file', async () => {
    lyingSha = '/data/g1/a.bin';
    expect(await run()).toBe('failed');
    expect(existsSync(join(root, 'g1/a.bin'))).toBe(false);
    expect(existsSync(join(root, 'g1/a.bin.part'))).toBe(false);
  });

  it('never deletes a file the new inventory drops', async () => {
    await run();
    inventoryBody = { groups: [{ label: 'one', files: [entry('data/g1/a.bin', A)] }] };
    expect(await run()).toBe('synced');
    expect(existsSync(join(root, 'g2/b.bin'))).toBe(true);
  });

  it('unreachable inventory returns offline', async () => {
    await new Promise((r) => server.close(r));
    expect(await run()).toBe('offline');
    server = createServer();
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  });
});
