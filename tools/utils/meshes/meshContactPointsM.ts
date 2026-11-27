import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Tier } from '../../../packages/shared/src/@types/data/Tier';
import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';
import { decodeMesh } from '../../../src/data/mesh/meshBinaryFormat';
import { meshTierPrefix } from '../../../src/utils/meshBodies/meshTierPrefix';
import { resolveDataFile } from '../data/resolveDataFile';

/** A vertex this close above the mesh's lowest z touches the ground. */
const CONTACT_BAND_M = 0.01;
/** Contact vertices closer than this, horizontally, are one foot: wider than a
 *  wheel's tread, narrower than the gap between two wheels on every rover. */
const FOOT_GAP_M = 0.25;

/** meshContactPointsM — the baked mesh's ground contacts, one per foot, in its
 *  local frame (+Z up): each foot's mean x, y and its lowest z. */
export async function meshContactPointsM(meshKey: string, tier: Tier): Promise<Vec3[]> {
  const path = resolveDataFile(resolve('public/data'), `${meshTierPrefix(meshKey, tier)}.mesh`);
  const buf = readFileSync(path);
  const mesh = await decodeMesh(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const p = mesh.positions;
  let minZ = Infinity;
  for (let v = 0; v < mesh.vertexCount; v++) minZ = Math.min(minZ, p[v * 3 + 2]!);
  const low: Vec3[] = [];
  for (let v = 0; v < mesh.vertexCount; v++) {
    if (p[v * 3 + 2]! <= minZ + CONTACT_BAND_M) low.push([p[v * 3]!, p[v * 3 + 1]!, p[v * 3 + 2]!]);
  }

  // Single-linkage clustering by union-find; today's rovers have under a thousand contact vertices.
  const parent = low.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
  for (let a = 0; a < low.length; a++) {
    for (let b = a + 1; b < low.length; b++) {
      if (Math.hypot(low[a]![0] - low[b]![0], low[a]![1] - low[b]![1]) < FOOT_GAP_M) {
        parent[root(a)] = root(b);
      }
    }
  }
  const feet = new Map<number, Vec3[]>();
  low.forEach((v, i) => feet.set(root(i), [...(feet.get(root(i)) ?? []), v]));
  return [...feet.values()].map((foot) => [
    foot.reduce((s, v) => s + v[0], 0) / foot.length,
    foot.reduce((s, v) => s + v[1], 0) / foot.length,
    Math.min(...foot.map((v) => v[2])),
  ]);
}
