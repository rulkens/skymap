/**
 * Drives the middleware with a fake req/res in a tmpdir cwd (the plugin's paths
 * are cwd-relative), so this file needs vitest's `forks` pool.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { outlinePlugin } from '../../../../tools/scene-workbench/plugin/outlinePlugin';

type FakeRes = {
  statusCode: number;
  body: string;
  ended: boolean;
  setHeader: () => void;
  end: (chunk?: string) => void;
};
type Middleware = (req: unknown, res: FakeRes, next: () => void) => void;

async function request(method: string, url: string, body?: unknown): Promise<FakeRes> {
  let middleware: Middleware | undefined;
  const server = { middlewares: { use: (mw: Middleware) => (middleware = mw) } };
  (outlinePlugin().configureServer as (server: unknown) => void)(server);
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = {
    method,
    url,
    on(event: string, cb: (chunk?: Buffer) => void) {
      if (event === 'data') payload.forEach((chunk) => cb(chunk));
      if (event === 'end') queueMicrotask(() => cb());
    },
  };
  const res: FakeRes = {
    statusCode: 200,
    body: '',
    ended: false,
    setHeader() {},
    end(chunk) {
      if (chunk !== undefined) this.body += chunk;
      this.ended = true;
    },
  };
  middleware!(req, res, () => {
    throw new Error('next() called');
  });
  await vi.waitFor(() => expect(res.ended).toBe(true));
  return res;
}

let root: string;
let previousCwd: string;

beforeAll(() => {
  previousCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'outline-plugin-'));
  const groupDir = join(root, 'public/data/geo3d/groups/g');
  mkdirSync(groupDir, { recursive: true });
  writeFileSync(
    join(groupDir, 'manifest.json'),
    JSON.stringify({
      formatVersion: 1,
      groupId: 'g',
      assets: [
        { kind: 'mesh', id: 'mesh' },
        { kind: 'pointCloud', id: 'lidar' },
      ],
    }),
  );
  process.chdir(root);
});

afterAll(() => {
  process.chdir(previousCwd);
  rmSync(root, { recursive: true, force: true });
});

describe('outlinePlugin', () => {
  it('unknown group returns 404', async () => {
    expect((await request('GET', '/api/outline/nope/mesh')).statusCode).toBe(404);
  });

  it('non-mesh asset returns 404', async () => {
    expect((await request('GET', '/api/outline/g/lidar')).statusCode).toBe(404);
  });

  it('invalid ring returns 400', async () => {
    const bowTie = [
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 1],
    ];
    const res = await request('PUT', '/api/outline/g/mesh', { formatVersion: 1, ringM: bowTie });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/intersect/);
  });

  it('PUT then GET round-trips a normalized ring', async () => {
    const clockwise = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ];
    const put = await request('PUT', '/api/outline/g/mesh', { formatVersion: 1, ringM: clockwise });
    expect(put.statusCode).toBe(200);
    const get = await request('GET', '/api/outline/g/mesh');
    expect(get.statusCode).toBe(200);
    expect(JSON.parse(get.body)).toEqual({ formatVersion: 1, ringM: [...clockwise].reverse() });
  });
});
