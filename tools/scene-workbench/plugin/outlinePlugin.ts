/**
 * `/api/outline/:groupId/:assetId` — GET/PUT a mesh asset's committed outline
 * (spec §4.2). Paths are cwd-relative like the bake CLIs', so the workbench must
 * run from the repo root. Plan 3b's nudge endpoint extends this plugin.
 */
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Plugin } from 'vite';

import type { Vec2 } from '../../../src/@types/math/Vec2';
import { normalizeRing } from '../../scene-recon/crop/normalizeRing';
import { groupManifestPath, meshOutlinePath } from '../../scene-recon/manifest/geo3dLayout';
import { readJsonBody } from '../../utils/http/readJsonBody';
import { sendJson } from '../../utils/http/sendJson';
import { writeJsonAtomic } from '../../utils/io/writeJsonAtomic';
import type { MeshOutline } from '../@types/MeshOutline';
import type { SceneManifest } from '../@types/SceneManifest';

const PREFIX = '/api/outline/';
// Ids become path segments: anything but word characters and '-' could traverse.
const ROUTE_RE = /^\/api\/outline\/([\w-]+)\/([\w-]+)$/;

export function outlinePlugin(): Plugin {
  return {
    name: 'scene-workbench-outline',
    configureServer(server) {
      // Connect wants a void handler; the async body is fired, not awaited.
      server.middlewares.use((req, res, next) => {
        void handleRequest(req, res, next);
      });
    },
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): Promise<void> {
  const path = (req.url ?? '').split('?')[0]!;
  if (!path.startsWith(PREFIX)) {
    next();
    return;
  }
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'PUT') {
    sendJson(res, 405, { error: `${method} not allowed` });
    return;
  }
  try {
    const match = ROUTE_RE.exec(path);
    if (!match || !(await isMeshAsset(match[1]!, match[2]!))) {
      sendJson(res, 404, { error: 'no such mesh asset' });
      return;
    }
    const outlinePath = meshOutlinePath(match[1]!, match[2]!);
    if (method === 'GET') {
      const text = await readFile(outlinePath, 'utf8').catch(() => null);
      if (text === null) sendJson(res, 404, { error: 'no outline' });
      else sendJson(res, 200, JSON.parse(text));
      return;
    }
    let outline: MeshOutline;
    try {
      outline = { formatVersion: 1, ringM: normalizeRing(parseRing(await readJsonBody(req))) };
    } catch (err) {
      sendJson(res, 400, { error: (err as Error).message });
      return;
    }
    sendJson(res, 200, await writeJsonAtomic<MeshOutline>(outlinePath, () => outline));
  } catch (err) {
    sendJson(res, 500, { error: (err as Error).message });
  }
}

async function isMeshAsset(groupId: string, assetId: string): Promise<boolean> {
  const text = await readFile(groupManifestPath(groupId), 'utf8').catch(() => null);
  if (text === null) return false;
  const manifest = JSON.parse(text) as SceneManifest;
  return manifest.assets.some((asset) => asset.id === assetId && asset.kind === 'mesh');
}

function parseRing(body: unknown): Vec2[] {
  const { formatVersion, ringM } = (body ?? {}) as Partial<MeshOutline>;
  const isCorner = (c: unknown) =>
    Array.isArray(c) && c.length === 2 && c.every((v) => typeof v === 'number');
  if (formatVersion !== 1 || !Array.isArray(ringM) || !ringM.every(isCorner)) {
    throw new Error('outline: body must be { formatVersion: 1, ringM: [x, y][] }');
  }
  return ringM as Vec2[];
}
