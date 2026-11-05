import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SyncProgress } from '../../../src/@types/SyncProgress';
import { runSync } from '../../../src/main/sync/runSync';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const A = Buffer.from('alpha');
const B = Buffer.from('bravo');
const C = Buffer.from('charlie');

let server: Server;
let baseUrl: string;
let root: string;
let objects: Record<string, Buffer>;
let inventoryBody: object;
/** Answers `path` with `status`, `times` times (Infinity: always). */
let failing: { path: string; status: number; times: number } | null;
let lyingSha: string | null;
let requests: string[];
let progress: SyncProgress[];

const entry = (key: string, bytes: Buffer) => ({ key, size: bytes.length, sha256: sha(bytes) });
const run = () => runSync({ baseUrl, dataRoot: root, onProgress: (p) => void progress.push(p) });

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'run-sync-'));
  objects = { '/data/g1/a.bin': A, '/data/g2/b.bin': B, '/data/g2/c.bin': C };
  inventoryBody = {
    groups: [
      { label: 'one', files: [entry('data/g1/a.bin', A)] },
      { label: 'two', files: [entry('data/g2/b.bin', B), entry('data/g2/c.bin', C)] },
    ],
  };
  failing = null;
  lyingSha = null;
  requests = [];
  progress = [];
  server = createServer((req, res) => {
    const path = req.url ?? '';
    requests.push(path);
    if (failing?.path === path && failing.times-- > 0) {
      res.statusCode = failing.status;
      res.end();
    } else if (path === '/data/offline-inventory.json') {
      res.end(JSON.stringify(inventoryBody));
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
    expect(await run()).toEqual({ kind: 'synced' });
    expect(readFileSync(join(root, 'g2/c.bin'))).toEqual(C);
    expect(JSON.parse(readFileSync(join(root, 'synced.json'), 'utf8'))).toEqual({
      'data/g1/a.bin': sha(A),
      'data/g2/b.bin': sha(B),
      'data/g2/c.bin': sha(C),
    });
    expect(JSON.parse(readFileSync(join(root, 'inventory.json'), 'utf8'))).toEqual(inventoryBody);
  });

  it('a second run against the same inventory downloads nothing and says unchanged', async () => {
    await run();
    requests = [];
    expect(await run()).toEqual({ kind: 'unchanged' });
    expect(requests).toEqual(['/data/offline-inventory.json']);
  });

  it('a new inventory that only drops a file is a change, though nothing downloads', async () => {
    await run();
    inventoryBody = { groups: [{ label: 'one', files: [entry('data/g1/a.bin', A)] }] };
    expect(await run()).toEqual({ kind: 'synced' });
    expect(existsSync(join(root, 'g2/b.bin'))).toBe(true);
  });

  it('a missing file fails the run at once and leaves the previous inventory.json', async () => {
    writeFileSync(join(root, 'inventory.json'), '{"groups":[]}');
    failing = { path: '/data/g2/c.bin', status: 404, times: Infinity };
    expect(await run()).toEqual({ kind: 'failed' });
    expect(requests.filter((r) => r === '/data/g2/c.bin')).toHaveLength(1);
    expect(readFileSync(join(root, 'inventory.json'), 'utf8')).toBe('{"groups":[]}');
  });

  it('the next run resumes and completes', async () => {
    failing = { path: '/data/g2/c.bin', status: 404, times: Infinity };
    await run();
    failing = null;
    requests = [];
    expect(await run()).toEqual({ kind: 'synced' });
    expect(requests).not.toContain('/data/g1/a.bin');
    expect(readFileSync(join(root, 'g2/c.bin'))).toEqual(C);
  });

  // Audit B I3: one transient error used to abort the whole 70k-file run.
  it('a transient server error is tried again within the same run', async () => {
    failing = { path: '/data/g2/b.bin', status: 500, times: 1 };
    expect(await run()).toEqual({ kind: 'synced' });
    expect(readFileSync(join(root, 'g2/b.bin'))).toEqual(B);
    expect(progress.at(-1)).toEqual({ doneBytes: 17, totalBytes: 17 });
  });

  it('a sha mismatch fails without a retry and leaves no renamed file', async () => {
    lyingSha = '/data/g1/a.bin';
    expect(await run()).toEqual({ kind: 'failed' });
    expect(requests.filter((r) => r === '/data/g1/a.bin')).toHaveLength(1);
    expect(existsSync(join(root, 'g1/a.bin'))).toBe(false);
    expect(existsSync(join(root, 'g1/a.bin.part'))).toBe(false);
  });

  // Audit B I10: progress went out once per stream chunk, thousands of IPC messages a second.
  it('reports progress a few times, not per chunk, and ends on every byte', async () => {
    const big = Buffer.alloc(4 * 1024 * 1024, 7);
    objects = { '/data/big.bin': big };
    inventoryBody = { groups: [{ label: 'big', files: [entry('data/big.bin', big)] }] };
    expect(await run()).toEqual({ kind: 'synced' });
    expect(progress[0]).toEqual({ doneBytes: 0, totalBytes: big.length });
    expect(progress.at(-1)).toEqual({ doneBytes: big.length, totalBytes: big.length });
    expect(progress.length).toBeLessThan(10);
  });

  it('not enough free disk returns the space needed before downloading', async () => {
    const huge = { key: 'data/g1/a.bin', size: 1e18, sha256: sha(A) };
    inventoryBody = { groups: [{ label: 'one', files: [huge] }] };
    const outcome = await run();
    expect(outcome).toMatchObject({ kind: 'diskFull', neededBytes: 1e18 });
    expect(requests).toEqual(['/data/offline-inventory.json']);
  });

  // A reachable server without a published inventory is not "no internet": that copy sent people
  // looking at their network.
  it('an inventory the server does not have fails rather than reading as offline', async () => {
    failing = { path: '/data/offline-inventory.json', status: 404, times: Infinity };
    expect(await run()).toEqual({ kind: 'failed' });
  });

  it('unreachable inventory returns offline', async () => {
    await new Promise((r) => server.close(r));
    expect(await run()).toEqual({ kind: 'offline' });
    server = createServer();
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  });
});
