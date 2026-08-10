/**
 * Faithful parse of the `polyphy-trace` v1 sidecar JSON — the cross-repo
 * contract between the PolyPhy fork's exporter and skymap's importer.
 * Validates rules 2-5 only (existence + npy cross-checks are the
 * builder's job). `voxelSizeMpc` comes back per-axis, uncollapsed — the
 * cubic-voxel collapse is builder-side (spec Decision 3).
 *
 * Schema: docs/superpowers/specs/2026-08-10-rhizome-scfd-importer-design.md
 */

import type { ScalarFieldFrameKind } from '../../src/@types/data/volume/ScalarFieldFrameKind';
import type { Vec3 } from '../../src/@types/math/Vec3';

export type PolyphyTraceSidecar = {
  readonly dims: Vec3;
  readonly originMpc: Vec3;
  /** Per-axis voxel edge length, Mpc. Not collapsed — see spec Decision 3. */
  readonly voxelSizeMpc: Vec3;
  readonly frame: ScalarFieldFrameKind;
  readonly valueUnits?: string;
  readonly provenance?: Record<string, unknown>;
};

// Single source for the frame check AND the error message's "expected"
// list, so the two can't drift as ScalarFieldFrameKind grows a member.
const ALLOWED_FRAMES: readonly ScalarFieldFrameKind[] = [
  'supergalactic-cartesian',
  'equatorial-cartesian',
  'galactic',
];

// Shared by dims / origin_mpc / voxel_size_mpc (rule 4): same "3 finite
// numbers" shape check, with an optional extra per-element predicate for
// the fields that also demand positive (voxel sizes) or positive-integer
// (dims) values.
function assertVec3(fieldName: string, raw: unknown, extra?: (n: number) => boolean): Vec3 {
  const valid =
    Array.isArray(raw) &&
    raw.length === 3 &&
    raw.every(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && (extra === undefined || extra(v)),
    );
  if (!valid) {
    throw new Error(
      `parsePolyphyTraceSidecar: ${fieldName} must be 3 finite numbers, got ${JSON.stringify(raw)}`,
    );
  }
  return raw as Vec3;
}

export function parsePolyphyTraceSidecar(text: string): PolyphyTraceSidecar {
  const raw: unknown = JSON.parse(text);
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('parsePolyphyTraceSidecar: sidecar is not a JSON object');
  }
  const obj = raw as Record<string, unknown>;

  if (obj.format !== 'polyphy-trace') {
    throw new Error(
      `parsePolyphyTraceSidecar: format ${JSON.stringify(obj.format)} is not "polyphy-trace" — wrong sidecar?`,
    );
  }
  if (obj.version !== 1) {
    throw new Error(
      `parsePolyphyTraceSidecar: unsupported version ${JSON.stringify(obj.version)} (expected 1); regenerate the cube with the current exporter`,
    );
  }

  const dims = assertVec3('dims', obj.dims, (n) => Number.isInteger(n) && n > 0);
  const originMpc = assertVec3('origin_mpc', obj.origin_mpc);
  const voxelSizeMpc = assertVec3('voxel_size_mpc', obj.voxel_size_mpc, (n) => n > 0);

  if (!ALLOWED_FRAMES.includes(obj.frame as ScalarFieldFrameKind)) {
    throw new Error(
      `parsePolyphyTraceSidecar: unknown frame ${JSON.stringify(obj.frame)} (expected ${ALLOWED_FRAMES.join(' | ')})`,
    );
  }
  const frame = obj.frame as ScalarFieldFrameKind;

  return {
    dims,
    originMpc,
    voxelSizeMpc,
    frame,
    // Spread conditionally so an absent optional key stays absent rather
    // than an explicit `undefined` — matches decodeScalarField's
    // velocityStats precedent (scalarFieldFormat.ts).
    ...(typeof obj.value_units === 'string' ? { valueUnits: obj.value_units } : {}),
    ...(typeof obj.provenance === 'object' && obj.provenance !== null
      ? { provenance: obj.provenance as Record<string, unknown> }
      : {}),
  };
}
