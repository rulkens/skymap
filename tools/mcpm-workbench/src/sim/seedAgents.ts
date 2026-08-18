import type { AgentInitMode } from '../../@types/AgentInitMode';
import type { AgentWeights } from '../../@types/AgentWeights';
import type { CatalogPoints } from '../../@types/CatalogPoints';
import type { GridBox } from '../../@types/GridBox';
import { mulberry32 } from '../../../../src/utils/random/mulberry32';
import { worldToVoxel } from '../field/worldToVoxel';

/**
 * The fork's UI offers agents in millions; the dispatch quantum is 100k —
 * also the propagate dispatch's truncation granularity (encodeStep.ts).
 */
export const AGENT_COUNT_STEP = 100_000;

const TWO_PI = Math.PI * 2;
const DATA_THETA_SENTINEL = -5; // main.cpp: "Marker value for input data"
const AROUND_DATA_SPREAD = 0.025; // main.cpp's random_spread

/** The six SoA lanes, in io.wesl's binding order (slots 3..8). */
export type SeededAgents = {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly phi: Float32Array;
  readonly theta: Float32Array;
  readonly weight: Float32Array;
};

/**
 * seedAgents — the fork's `update_particles` lambda, in VOXEL coordinates.
 *
 * Indices [0, points.count) are the catalog points themselves: theta is the
 * -5 sentinel the propagate kernel branches on, phi is the (unused) halo colour
 * flag, weight comes from `deriveAgentWeights`. Everything past that is a free
 * agent. Deterministic by `seed` — never Math.random, or a look is
 * irreproducible across reloads. `points`/`weights` must already be
 * box-culled (`cullPointsToBox`, task S14) — an out-of-box anchor would wrap
 * onto the opposite face under periodic agent movement.
 */
export function seedAgents(opts: {
  readonly points: CatalogPoints;
  readonly weights: AgentWeights;
  readonly box: GridBox;
  readonly agentCount: number;
  readonly mode: AgentInitMode;
  readonly seed: number;
}): SeededAgents {
  const { points, weights, box, agentCount, mode, seed } = opts;
  // Below AGENT_COUNT_STEP, the propagate dispatch's truncation (encodeStep.ts) can
  // floor gridZ to 0 and silently run nothing; a positive multiple keeps it >= 1.
  if (agentCount < AGENT_COUNT_STEP || agentCount % AGENT_COUNT_STEP !== 0) {
    throw new Error(`seedAgents: agentCount must be a positive multiple of ${AGENT_COUNT_STEP}`);
  }

  const nData = points.count;
  const total = nData + agentCount;
  const x = new Float32Array(total);
  const y = new Float32Array(total);
  const z = new Float32Array(total);
  const phi = new Float32Array(total);
  const theta = new Float32Array(total);
  const weight = new Float32Array(total);

  for (let i = 0; i < nData; i++) {
    const v = worldToVoxel(box, [
      points.positions[3 * i]!,
      points.positions[3 * i + 1]!,
      points.positions[3 * i + 2]!,
    ]);
    x[i] = v[0];
    y[i] = v[1];
    z[i] = v[2];
    phi[i] = 0;
    theta[i] = DATA_THETA_SENTINEL;
    weight[i] = weights.weights[i]!;
  }

  const random = mulberry32(seed);
  const shortestAxis = Math.min(box.dims[0], box.dims[1], box.dims[2]);
  // Callers pass an already-box-culled `points` (task S14's cullPointsToBox), so
  // nData can be 0 when every catalog point in this box selection sits outside
  // it. 'aroundData' has nothing to anchor on then — `nData - 1` below would go
  // negative and index x[-1] (undefined -> NaN) — so degrade to uniform, same
  // as the zero-catalog-points status rather than a silent NaN scatter.
  const effectiveMode: AgentInitMode = mode === 'aroundData' && nData === 0 ? 'uniform' : mode;
  for (let i = nData; i < total; i++) {
    if (effectiveMode === 'aroundData') {
      // The fork's upper bound is data_count-1, so the last point is never the
      // anchor; the offset is its disc-shell sample, not a ball.
      const anchor = Math.floor(random() * (nData - 1));
      const radius = AROUND_DATA_SPREAD * shortestAxis * random();
      const xi1 = random();
      const xi2 = random();
      const discRadius = radius * Math.sqrt(xi2 * (1 - xi2));
      x[i] = x[anchor]! + discRadius * Math.cos(TWO_PI * xi1);
      y[i] = y[anchor]! + discRadius * Math.sin(TWO_PI * xi1);
      z[i] = z[anchor]! + 0.5 * radius * (1 - 2 * xi2);
    } else {
      x[i] = random() * box.dims[0];
      y[i] = random() * box.dims[1];
      z[i] = random() * box.dims[2];
    }
    phi[i] = random() * TWO_PI;
    theta[i] = Math.acos(2 * random() - 1);
    weight[i] = 1;
  }

  return { x, y, z, phi, theta, weight };
}
