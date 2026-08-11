/**
 * verifyFlowField.ts — physical sanity probe for the runtime `flowfield.scfd`.
 *
 * The flow build (`buildFlowField.ts`) carries one assumption it cannot prove
 * from committed code: that the CF4++ velocity components ride in **native
 * supergalactic-Cartesian order with no permutation and no sign flip** (vx→SGX,
 * vy→SGY, vz→SGZ). If that assumption is wrong — e.g. the upstream array is
 * sign-flipped, or an axis is transposed — the cube still *builds*, the frame
 * self-check still passes (it only checks geometry, not the vectors), and the
 * ribbons still animate. They just flow the WRONG way: *outward* from the great
 * attractors instead of *inward*. The design doc flags this as the one-time
 * maintainer check on real data (spec §"native SG order"); this script IS that
 * check, automated.
 *
 * ### The physics
 *
 * A peculiar-velocity field is gravitational infall: matter streams *toward*
 * overdense regions (clusters / superclusters — "attractors", velocity sinks)
 * and *away from* underdense regions (voids — "repellers", velocity sources).
 * So at a known attractor `a`, the surrounding flow should CONVERGE on it. We
 * measure that directly: sample the velocity on a shell around `a`, project
 * each sample onto the inward radial direction, and average. A positive mean
 * ("infall") means the field converges → the sign convention is correct. A
 * negative mean at every attractor means the whole field is inverted → a global
 * sign flip is needed in `buildFlowField.ts`. As a source-side contrast we also
 * report the divergence at the cube's most-underdense voxel (a void), which
 * should be the opposite sign (outflow).
 *
 * Both position-space and velocity-space are supergalactic Cartesian, so the
 * radial dot products are taken in one consistent frame — no model matrix, no
 * GPU, no rendering. This isolates the DATA question (does the cube hold the
 * right vectors?) from the RENDER question (does the renderer place them right?),
 * which is checked visually in-app.
 *
 * Usage:  npm run verify-flow-field
 * Output: plain text on stdout; exits non-zero if the verdict is a global flip.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  decodeScalarField,
  SCALAR_FIELD_DATA_PREFIX,
} from '../../src/data/volume/scalarFieldFormat';
import { f16BitsToFloat } from '../utils/math/f16BitsToFloat';
import { raDecDistToEqCart } from '../../src/utils/math/raDecDistToEqCart';
import { eqToSg } from '../utils/math/eqToSg';
import type { Vec3 } from '../../src/@types/math/Vec3';
import { resolveDataFile } from '../utils/data/resolveDataFile';

/**
 * Well-known velocity SINKS — overdense clusters / superclusters the local
 * flow falls toward. RA (hours) / Dec (deg) / distance (Mpc) in catalogue
 * convention, the same triple `raDecDistToEqCart` consumes. Distances are
 * approximate (a few Mpc either way does not change an infall sign), drawn from
 * standard cluster compilations; the Great Attractor row matches the build's
 * own frame self-check anchor.
 */
const ATTRACTORS: readonly { name: string; raHours: number; decDeg: number; distMpc: number }[] = [
  { name: 'Great Attractor (Norma)', raHours: 16.25, decDeg: -60.84, distMpc: 68 },
  { name: 'Shapley Supercluster', raHours: 13.47, decDeg: -31.5, distMpc: 200 },
  { name: 'Perseus cluster (A426)', raHours: 3.33, decDeg: 41.5, distMpc: 73 },
  { name: 'Coma cluster (A1656)', raHours: 12.997, decDeg: 27.98, distMpc: 99 },
  { name: 'Virgo cluster', raHours: 12.45, decDeg: 12.72, distMpc: 16.5 },
];

/** Shell radius for the infall average, in Mpc (~4 voxels — close enough to
 *  feel the attractor, far enough to be in the infall regime, not turnaround). */
const SHELL_RADIUS_MPC = 30;

/**
 * CF4++ reliability horizon, Mpc. The Courtois 2025 reconstruction is
 * well-constrained by Cosmicflows-4 distances only to ~150 Mpc; beyond that
 * it is increasingly prior-dominated, so the velocity field there carries
 * little information and an individual anchor can read either sign. The
 * verdict is therefore based on the WELL-CONSTRAINED attractors; anchors past
 * the horizon (e.g. Shapley at ~200 Mpc) are reported for context but do not
 * count for or against the sign convention.
 */
const RELIABLE_HORIZON_MPC = 150;

/**
 * The 26 unit directions of a 3×3×3 neighbourhood (all but the centre),
 * normalised — an isotropic-enough sampling of a sphere for a sign average
 * without pulling in a Fibonacci-sphere helper.
 */
const SHELL_DIRS: readonly Vec3[] = (() => {
  const dirs: Vec3[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const len = Math.hypot(dx, dy, dz);
        dirs.push([dx / len, dy / len, dz / len]);
      }
    }
  }
  return dirs;
})();

type FlowCube = {
  readonly n: number;
  readonly origin: Vec3;
  readonly voxelSizeMpc: number;
  readonly voxels: Uint16Array;
};

/** Map an SG-Cartesian position to its integer cell, or null if out of bounds. */
function sgToCell(cube: FlowCube, sg: Vec3): [number, number, number] | null {
  const i = Math.floor((sg[0] - cube.origin[0]) / cube.voxelSizeMpc);
  const j = Math.floor((sg[1] - cube.origin[1]) / cube.voxelSizeMpc);
  const k = Math.floor((sg[2] - cube.origin[2]) / cube.voxelSizeMpc);
  if (i < 0 || i >= cube.n || j < 0 || j >= cube.n || k < 0 || k >= cube.n) return null;
  return [i, j, k];
}

/**
 * Read the native-SG velocity (km/s) at integer cell (i, j, k). Linear index
 * is x-fastest then y then z (`k*N*N + j*N + i`), matching the cube's voxel
 * order and `buildFlowField`'s `outputIdx`; channels 0..2 are (vx, vy, vz).
 */
function velocityAtCell(cube: FlowCube, i: number, j: number, k: number): Vec3 {
  const base = (k * cube.n * cube.n + j * cube.n + i) * 4;
  return [
    f16BitsToFloat(cube.voxels[base + 0]!),
    f16BitsToFloat(cube.voxels[base + 1]!),
    f16BitsToFloat(cube.voxels[base + 2]!),
  ];
}

/** Velocity at an SG position via nearest cell; null if outside the cube. */
function velocityAtSg(cube: FlowCube, sg: Vec3): Vec3 | null {
  const cell = sgToCell(cube, sg);
  if (cell === null) return null;
  return velocityAtCell(cube, cell[0], cell[1], cell[2]);
}

/** Read the overdensity δ (channel 3) at integer cell. */
function deltaAtCell(cube: FlowCube, i: number, j: number, k: number): number {
  const base = (k * cube.n * cube.n + j * cube.n + i) * 4;
  return f16BitsToFloat(cube.voxels[base + 3]!);
}

/**
 * Mean inward-radial velocity on a shell around `centre` (SG Cartesian, Mpc).
 * Positive ⇒ the flow converges on `centre` (infall, the correct sign for an
 * attractor). Returns the mean over whichever shell samples landed in bounds.
 */
function meanInfall(cube: FlowCube, centre: Vec3): { infall: number; samples: number } {
  let sum = 0;
  let samples = 0;
  for (const dir of SHELL_DIRS) {
    const p: Vec3 = [
      centre[0] + dir[0] * SHELL_RADIUS_MPC,
      centre[1] + dir[1] * SHELL_RADIUS_MPC,
      centre[2] + dir[2] * SHELL_RADIUS_MPC,
    ];
    const v = velocityAtSg(cube, p);
    if (v === null) continue;
    // Inward radial = -dir (dir points from centre outward to the sample).
    // Infall component = v · (-dir) = how strongly the sample streams back
    // toward the centre.
    sum += -(v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]);
    samples++;
  }
  return { infall: samples === 0 ? 0 : sum / samples, samples };
}

/**
 * Central-difference divergence ∇·v at integer cell (km/s per Mpc). Negative at
 * a sink (convergent inflow), positive at a source (void outflow). Skips cells
 * on the cube face (no neighbour to difference against) by returning NaN.
 */
function divergenceAtCell(cube: FlowCube, i: number, j: number, k: number): number {
  if (i <= 0 || i >= cube.n - 1 || j <= 0 || j >= cube.n - 1 || k <= 0 || k >= cube.n - 1) {
    return NaN;
  }
  const h = cube.voxelSizeMpc;
  const dvx = velocityAtCell(cube, i + 1, j, k)[0] - velocityAtCell(cube, i - 1, j, k)[0];
  const dvy = velocityAtCell(cube, i, j + 1, k)[1] - velocityAtCell(cube, i, j - 1, k)[1];
  const dvz = velocityAtCell(cube, i, j, k + 1)[2] - velocityAtCell(cube, i, j, k - 1)[2];
  return (dvx + dvy + dvz) / (2 * h);
}

function main(): void {
  const path =
    process.argv[2] ??
    resolveDataFile(resolve('public/data'), `${SCALAR_FIELD_DATA_PREFIX}/flowfield.scfd`);
  const buf = readFileSync(path);
  const decoded = decodeScalarField(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
  const cube: FlowCube = {
    n: decoded.dims[0],
    origin: decoded.origin,
    voxelSizeMpc: decoded.voxelSize,
    voxels: decoded.voxels,
  };
  console.log(
    `Loaded ${path} — ${cube.n}³, voxel ${cube.voxelSizeMpc.toFixed(3)} Mpc, ` +
      `origin (${cube.origin.map((c) => c.toFixed(0)).join(', ')}) Mpc\n`,
  );

  console.log(`── Infall at known attractors (shell radius ${SHELL_RADIUS_MPC} Mpc) ──`);
  console.log('  Expect POSITIVE infall + NEGATIVE divergence — the flow converges on a sink.\n');
  // The verdict tallies only the well-constrained subset (dist < horizon).
  let reliableInfall = 0;
  let reliableTotal = 0;
  for (const a of ATTRACTORS) {
    const sg = eqToSg(raDecDistToEqCart(a));
    const cell = sgToCell(cube, sg);
    if (cell === null) {
      console.log(`  ${a.name.padEnd(26)} OUT OF BOUNDS`);
      continue;
    }
    const reliable = a.distMpc < RELIABLE_HORIZON_MPC;
    const { infall, samples } = meanInfall(cube, sg);
    const div = divergenceAtCell(cube, cell[0], cell[1], cell[2]);
    const centreV = velocityAtCell(cube, cell[0], cell[1], cell[2]);
    const centreSpeed = Math.hypot(centreV[0], centreV[1], centreV[2]);
    const infallOk = infall > 0;
    const divOk = !Number.isNaN(div) && div < 0;
    if (reliable) {
      reliableTotal++;
      if (infallOk) reliableInfall++;
    }
    // Past the horizon the sign is uninformative, so don't flag it good/bad.
    const flag = !reliable ? '·· ' : infallOk && divOk ? 'OK ' : infallOk ? '~  ' : 'BAD';
    const horizonNote = reliable ? '' : '  [beyond CF4++ horizon]';
    console.log(
      `  ${flag} ${a.name.padEnd(26)} infall ${signed(infall, 1)} km/s  ` +
        `∇·v ${signed(div, 2)} /Mpc  ` +
        `|v|@centre ${centreSpeed.toFixed(0)} km/s  ${a.distMpc} Mpc${horizonNote}  ` +
        `(${samples}/${SHELL_DIRS.length} shell)`,
    );
  }

  // ── Source-side contrast: the global density minimum should be a void,
  //    i.e. a velocity SOURCE (positive divergence / outflow). No external
  //    coordinates needed — the cube tells us where its deepest void is.
  const voidCell = findMinDeltaCell(cube);
  const voidDiv = divergenceAtCell(cube, voidCell.i, voidCell.j, voidCell.k);
  console.log(`\n── Source contrast: deepest void (global δ-min) ──`);
  console.log(
    `  δ-min ${voidCell.delta.toFixed(3)} at cell (${voidCell.i}, ${voidCell.j}, ${voidCell.k})  ` +
      `∇·v ${signed(voidDiv, 2)} /Mpc  ` +
      `(expect POSITIVE — outflow from a void)`,
  );

  // ── Verdict ───────────────────────────────────────────────────────────
  // Decided on the well-constrained attractors (dist < horizon) plus the
  // void contrast. A genuine global sign flip inverts EVERY sink and the
  // void together; a single distant outlier does not.
  const voidOutflow = !Number.isNaN(voidDiv) && voidDiv > 0;
  console.log('\n── Verdict ──');
  if (reliableTotal === 0) {
    console.log('  INCONCLUSIVE: no well-constrained attractor in bounds (frame mismatch?).');
    process.exit(1);
  } else if (reliableInfall === reliableTotal && voidOutflow) {
    console.log(
      `  ✓ INFALL CONFIRMED — all ${reliableTotal} well-constrained attractors converge,\n` +
        `    and the deepest void diverges. The native-SG, no-sign-flip assumption holds:\n` +
        `    flowfield.scfd is correct. (Anchors beyond ${RELIABLE_HORIZON_MPC} Mpc are\n` +
        `    prior-dominated and uninformative — see the [beyond CF4++ horizon] rows.)`,
    );
  } else if (reliableInfall === 0 && !voidOutflow) {
    console.log(
      `  ✗ GLOBAL SIGN FLIP — every well-constrained attractor shows OUTflow and the\n` +
        `    void shows INflow. The field is inverted; negate (vx, vy, vz) in buildFlowField.ts.`,
    );
    process.exit(1);
  } else {
    console.log(
      `  ? INCONCLUSIVE — ${reliableInfall}/${reliableTotal} well-constrained attractors infall, ` +
        `void outflow ${voidOutflow ? 'yes' : 'no'}.\n` +
        `    Not a clean global flip; investigate an axis permutation or a bad anchor.`,
    );
    process.exit(1);
  }
}

/** Find the cell with the smallest δ (deepest void) over the whole cube. */
function findMinDeltaCell(cube: FlowCube): { i: number; j: number; k: number; delta: number } {
  let best = { i: 0, j: 0, k: 0, delta: Infinity };
  for (let k = 0; k < cube.n; k++) {
    for (let j = 0; j < cube.n; j++) {
      for (let i = 0; i < cube.n; i++) {
        const d = deltaAtCell(cube, i, j, k);
        if (d < best.delta) best = { i, j, k, delta: d };
      }
    }
  }
  return best;
}

/** Format a number with an explicit leading sign, for a tidy aligned column. */
function signed(value: number, digits: number): string {
  if (Number.isNaN(value)) return 'n/a';
  return (value >= 0 ? '+' : '') + value.toFixed(digits);
}

main();
