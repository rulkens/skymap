import type { AgentInitMode } from '../../@types/AgentInitMode';
import type { GridBox } from '../../@types/GridBox';
import type { McpmParams } from '../../@types/McpmParams';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { MCPM_PARAM_KEYS, MCPM_PARAMS_FORMAT, MCPM_PARAMS_VERSION } from './exportParams';

export type ImportedParams = {
  readonly params: McpmParams;
  readonly agentCount: number;
  readonly initMode: AgentInitMode;
  readonly gridBox: GridBox;
};

// Mirrors buildRhizomeVolume.ts's own "Voxel-size spread assert" (rule 6): a
// hand-edited preset whose sizeMpc/dims/voxelSizeMpc no longer agree must
// fail HERE, before deriveGridBox's importedBox override hands a non-cubic
// box straight to the sim (autoFitGridBox's cubic-voxel invariant, T7).
const VOXEL_SPREAD_LIMIT = 0.005;

function fail(reason: string): never {
  throw new Error(`importParams: ${reason}`);
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) fail(`"${field}" must be an object`);
  return value as Record<string, unknown>;
}

function num(obj: Record<string, unknown>, field: string): number {
  const v = obj[field];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`"${field}" must be a finite number`);
  return v as number;
}

function vec3(obj: Record<string, unknown>, field: string): Vec3 {
  const v = obj[field];
  if (
    !Array.isArray(v) ||
    v.length !== 3 ||
    v.some((n) => typeof n !== 'number' || !Number.isFinite(n))
  ) {
    fail(`"${field}" must be an array of 3 finite numbers`);
  }
  return v as Vec3;
}

/**
 * importParams — the V3 load-side inverse of `exportParams`. Validation is
 * total: every field is checked before anything is trusted, so a malformed
 * or hand-edited file surfaces a readable Error (the caller turns it into a
 * status line) instead of a partially-built preset reaching the store.
 */
export function importParams(json: string): ImportedParams {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    fail('not valid JSON');
  }
  const root = asRecord(raw, 'root');
  if (root.format !== MCPM_PARAMS_FORMAT) {
    fail(`unrecognized format "${String(root.format)}" — expected "${MCPM_PARAMS_FORMAT}"`);
  }
  if (root.version !== MCPM_PARAMS_VERSION) {
    fail(`unsupported version ${String(root.version)} — expected ${MCPM_PARAMS_VERSION}`);
  }

  const p = asRecord(root.params, 'params');
  const params = {} as Record<keyof McpmParams, number>;
  for (const key of MCPM_PARAM_KEYS) params[key] = num(p, key);

  const agentCount = num(root, 'agentCount');
  const initMode = root.initMode;
  if (initMode !== 'aroundData' && initMode !== 'uniform') {
    fail('"initMode" must be "aroundData" or "uniform"');
  }

  const g = asRecord(root.gridBox, 'gridBox');
  const centerMpc = vec3(g, 'centerMpc');
  const sizeMpc = vec3(g, 'sizeMpc');
  const dims = vec3(g, 'dims');
  const voxelSizeMpc = num(g, 'voxelSizeMpc');
  if (dims.some((d) => d <= 0)) fail('"gridBox.dims" must be positive on every axis');

  const impliedVoxelSizes: Vec3 = [
    sizeMpc[0] / dims[0],
    sizeMpc[1] / dims[1],
    sizeMpc[2] / dims[2],
  ];
  const allVoxelSizes = [...impliedVoxelSizes, voxelSizeMpc];
  const mean = allVoxelSizes.reduce((a, b) => a + b, 0) / allVoxelSizes.length;
  const spread = (Math.max(...allVoxelSizes) - Math.min(...allVoxelSizes)) / mean;
  if (spread > VOXEL_SPREAD_LIMIT) {
    fail(
      `gridBox voxels are not cubic — spread ${(spread * 100).toFixed(2)}% exceeds the ` +
        `${(VOXEL_SPREAD_LIMIT * 100).toFixed(1)}% limit`,
    );
  }

  return {
    params: params as McpmParams,
    agentCount,
    initMode,
    gridBox: { centerMpc, sizeMpc, dims, voxelSizeMpc },
  };
}
