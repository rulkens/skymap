#!/usr/bin/env node
/**
 * buildFilaments — assemble the cosmic-web filament skeleton.
 *
 * Pipeline:
 *
 *   1. Read public/data/{2mrs,glade}.bin → merged xyz positions, filtered
 *      to D < 200 Mpc.  SDSS is intentionally excluded — its wedge
 *      footprint dominates the density field at the survey edges and
 *      DisPerSE locks onto those boundaries instead of the cosmic web.
 *      See `readMergedPositions` for the full rationale.
 *   2. Write data/raw/galaxies_merged.tsv (DisPerSE ASCII-survey format,
 *      header `px py pz` followed by one line per galaxy: `x y z`)
 *   3. Run DisPerSE: delaunay_3D → mse → skelconv (default 3σ
 *      persistence, 2 smoothing passes).  delaunay_3D is required because
 *      mse cannot operate on a raw point cloud — it needs the Delaunay
 *      simplicial complex + DTFE density field that delaunay_3D produces.
 *   4. Parse the resulting .NDskl, convert to FilamentCloud, encode FILA v1
 *   5. Write public/data/filaments.bin
 *
 * Run order: must be after `npm run build-all` so the survey .bin files
 * exist on disk in `public/data/`.  The orchestrator reads those instead
 * of re-parsing the raw catalogues, because by the time DisPerSE runs we
 * already have the cross-matched, deduped positions on disk and reusing
 * them keeps this script from depending on the (slow, GLADE-streaming)
 * raw-catalogue path.
 *
 * External requirements:
 *   - DisPerSE installed (`delaunay_3D`, `mse`, and `skelconv` on PATH).
 *     See README for build instructions; this script throws a friendly
 *     error if any binary is missing.  Note delaunay_3D is only built if
 *     CGAL was available at DisPerSE configure time.
 *   - ~16 GB RAM during the `mse` step (DisPerSE peaks high).
 *   - 6-12 hours wall time on a workstation for the merged catalogue.
 *
 * The `--cut` flag overrides the default 5σ persistence threshold (e.g.
 * `--cut 7` for a sparser, more conservative skeleton).  `--smooth N`
 * adjusts the number of skelconv smoothing passes.
 *
 * Why we shell out rather than wrap a library?  DisPerSE is a sizeable
 * C++ codebase with native dependencies (CFITSIO, optionally MPI); a
 * subprocess boundary is the only practical interface from Node.  We
 * trade one-shot wall time for zero install pain on the JS side.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodePointCloud } from '../src/data/pointCloudFormat.js';
import { parseNDskl, skeletonToFilamentCloud } from './parsers/ndskl.js';
import { encodeFilaments } from '../src/data/filamentBinaryFormat.js';
import type { PointCloud } from '../src/@types/index.js';

/**
 * Default persistence cut in σ.  Lower = more filaments accepted as
 * persistent ridges; higher = sparser, more conservative skeleton.
 *
 * 5σ (Sousbie 2011 original) is the canonical "robust spine" — visually
 * the cosmic web with its leaves stripped off, only the most persistent
 * ridges survive.  3σ is the typical cosmology-paper choice (Tempel+
 * 2014, etc.) and gives ~3–5× more filaments without crossing into
 * shot-noise territory; this is what we default to.  2σ is dense, may
 * include Poisson-noise ridges, but visually rich for outreach renders.
 *
 * Override with `--cut N` on the CLI.  The slow Delaunay-tessellation
 * stage (`.NDnet`) is cached on disk and shared across cuts, so
 * iterating on this knob only re-runs `mse + skelconv` (minutes, not
 * hours).
 */
const DEFAULT_PERSISTENCE_CUT = 3;
const DEFAULT_SMOOTHING_PASSES = 2;

/**
 * Tiny argv parser.  We don't pull in a flags library because there are
 * exactly two flags and the cost of a dependency outweighs the benefit
 * of a 5-line hand-rolled loop.  `--cut` and `--smooth` each consume the
 * next argv slot as their numeric value; anything else is ignored.
 */
function parseArgs(): { cut: number; smooth: number } {
  const argv = process.argv.slice(2);
  let cut = DEFAULT_PERSISTENCE_CUT;
  let smooth = DEFAULT_SMOOTHING_PASSES;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cut') cut = Number(argv[++i] ?? cut);
    else if (a === '--smooth') smooth = Number(argv[++i] ?? smooth);
  }
  return { cut, smooth };
}

/**
 * Probe the PATH for the DisPerSE binaries we need.  We invoke each with
 * `--help` because it exits 0 quickly and is portable across DisPerSE
 * versions (older builds don't honour `--version`).  We check BOTH `mse`
 * and `skelconv` up front: a partially-built install (e.g. mse linked
 * but skelconv's CFITSIO link failed) would otherwise sit through the
 * multi-hour mse run before crashing on the missing skelconv.  A missing
 * binary or any non-zero exit is treated as "not installed" and we fail
 * loudly with a pointer to the README so the operator knows what to fix.
 */
function checkDisperse(): void {
  // delaunay_3D, mse and skelconv all participate in the pipeline, so we
  // probe each one up front.  delaunay_3D in particular is *optional* in
  // the DisPerSE build (it requires CGAL); a CGAL-less install will have
  // mse/skelconv but not delaunay_3D, and the failure mode without an
  // up-front check is a confusing "command not found" buried under the
  // multi-second startup of the first stage.
  //
  // delaunay_3D (unlike the other two) prints usage and exits with status
  // 0 when called with no arguments, so we probe it that way; passing
  // `--help` would still work but is not what the binary documents.
  const probes: Array<readonly [string, string[]]> = [
    ['delaunay_3D', []],
    ['mse', ['--help']],
    ['skelconv', ['--help']],
  ];
  for (const [bin, args] of probes) {
    const r = spawnSync(bin, args, { encoding: 'utf8' });
    if (r.error || r.status !== 0) {
      process.stderr.write(
        `error: DisPerSE \`${bin}\` binary not found on PATH (or returned non-zero).\n` +
          'Install: see README "Filament skeleton" section.\n' +
          '         delaunay_3D requires CGAL at DisPerSE build time.\n',
      );
      process.exit(1);
    }
  }
}

/**
 * Read each survey's .bin from `public/data/` and concatenate the xyz
 * positions into one big Float32Array.  Missing files are treated as
 * non-fatal warnings — running with only SDSS available is a useful
 * intermediate state during development.
 *
 * Buffer→ArrayBuffer note: `readFileSync` returns a Node `Buffer`, whose
 * `.buffer` is the (possibly shared, possibly offset) underlying pool.
 * `decodePointCloud` constructs a `DataView` over the buffer starting at
 * byte 0, so handing it the pool directly would mis-read every file.
 * We slice out a clean owned ArrayBuffer covering exactly this Buffer's
 * bytes before decoding.
 */
/**
 * Maximum distance (Mpc) from the world origin for a galaxy to be
 * eligible as DisPerSE input.  200 Mpc captures the Local Supercluster
 * (Virgo + the Great Attractor direction) and the leading edge of the
 * Sloan Great Wall sheet without dragging in SDSS-pencil-beam volumes
 * where survey selection effects dominate the density field.  Past
 * ~250 Mpc, 2MRS's K-magnitude completeness drops below the level
 * needed for honest density estimation, so DisPerSE's persistent
 * ridges out there reflect the survey's drop-off rather than real
 * cosmic structure.
 */
const MAX_DISTANCE_MPC = 200;

/**
 * Minimum distance (Mpc) — excludes the Local-Group / Local-Sheet
 * inner zone where cz → distance via cz/H0 breaks down.
 *
 * For nearby galaxies (D < ~5 Mpc) the observed line-of-sight velocity
 * is dominated by peculiar motion (gravitational infall toward Virgo,
 * Local Group dynamics, etc.) rather than the Hubble flow; cz/H0 then
 * produces near-zero or even negative pseudo-distances, smearing real
 * positions onto a tiny knot around the world origin.  M31's cz is
 * ≈−300 km/s; the LMC/SMC are ≈+280 km/s — both map to fractions of a
 * Mpc instead of their actual distances (770 kpc, 50 kpc).
 *
 * DisPerSE then identifies that ~83-galaxy near-origin knot as a
 * persistent hub and threads filaments outward from the Milky Way's
 * position — visually wrong, since we sit in the Local Void with no
 * real filament hub here.  Cutting at 5 Mpc removes the Local Group
 * and Local Sheet from the input without losing any cosmic-web
 * structure (the cosmic-web concept doesn't apply at < ~5 Mpc; that
 * scale is dominated by gravitational dynamics, not topology).
 */
const MIN_DISTANCE_MPC = 5;

/**
 * Read each catalogue's `.bin`, merge into a single Float32Array of xyz
 * triples, filter to `MAX_DISTANCE_MPC`.
 *
 * **SDSS is intentionally excluded.** The wedge footprint (~9000 deg²
 * out of 41253) is the dominant artefact source: DisPerSE locks onto
 * the wedge boundaries because the density field has a sharp step at
 * the survey edge.  2MRS (all-sky, K < 11.75) and GLADE (all-sky-ish
 * union of 2MASS, HyperLEDA, GWGC, SDSS) give a much cleaner all-sky
 * density field for the cosmic-web skeleton task even though SDSS
 * dominates the catalogue by raw count.
 *
 * Distance gating is *euclidean* against the world origin (Earth/Sun
 * position in skymap world coords).  Galaxies are stored in cz/H0
 * comoving Mpc which is a fine approximation to true distance at
 * redshifts ≪ 1; refining to a luminosity / angular-diameter
 * distance is unnecessary at this scale (cz < 14000 km/s for the
 * 200 Mpc cut).
 */
function readMergedPositions(): { count: number; positions: Float32Array } {
  const sources = ['2mrs.bin', 'glade.bin'] as const;
  const clouds: PointCloud[] = [];
  for (const name of sources) {
    const path = resolve('public/data', name);
    if (!existsSync(path)) {
      process.stderr.write(`warning: ${path} not found — skipping\n`);
      continue;
    }
    const buf = readFileSync(path);
    // Slice yields a fresh ArrayBuffer with byteOffset=0 and the exact
    // file length, sidestepping the pooled-Buffer offset gotcha noted
    // above.
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    clouds.push(decodePointCloud(ab));
  }

  // First pass: count survivors of the inner+outer distance filter.
  // We build the filtered output buffer to its final size in one
  // allocation (cheaper than push + concat) since the worst-case bound
  // is the unfiltered total count.
  const distSqMin = MIN_DISTANCE_MPC * MIN_DISTANCE_MPC;
  const distSqMax = MAX_DISTANCE_MPC * MAX_DISTANCE_MPC;
  const totalRaw = clouds.reduce((acc, c) => acc + c.count, 0);
  const positions = new Float32Array(totalRaw * 3);
  let kept = 0;
  for (const c of clouds) {
    for (let i = 0; i < c.count; i++) {
      const x = c.positions[i * 3 + 0]!;
      const y = c.positions[i * 3 + 1]!;
      const z = c.positions[i * 3 + 2]!;
      const r2 = x * x + y * y + z * z;
      if (r2 < distSqMin || r2 > distSqMax) continue;
      positions[kept * 3 + 0] = x;
      positions[kept * 3 + 1] = y;
      positions[kept * 3 + 2] = z;
      kept += 1;
    }
  }
  process.stderr.write(
    `  filtered ${totalRaw.toLocaleString()} → ${kept.toLocaleString()} ` +
      `(${MIN_DISTANCE_MPC} Mpc < D < ${MAX_DISTANCE_MPC} Mpc)\n`,
  );
  // Trim trailing unused slots so downstream consumers see the exact
  // count rather than zero-padded entries that DisPerSE would treat as
  // legitimate (0,0,0) points clustering at the origin.
  return { count: kept, positions: positions.slice(0, kept * 3) };
}

/**
 * Materialise the per-galaxy positions as a TSV file DisPerSE can read.
 * One line per galaxy, three space-separated floats: `x y z` in Mpc.
 *
 * The leading `px py pz` header is *not optional* — it is what makes
 * DisPerSE's `isAsciiSurvey()` (see `src/C/asciiSurvey.c`) classify the
 * file as an ASCII point survey rather than fall through to the generic
 * `NDfield` / FITS detectors and ultimately fail with the unhelpful
 * "ERROR in sampledDataInput: could not read file." message.  Without
 * the header, `delaunay_3D` rejects the file before reading a single
 * point.  Other column names DisPerSE understands are documented in
 * `asciiSurvey.c`: `id, vx/vy/vz, ra/dec, dist, z, mass`.
 *
 * We build the line array first, then `writeFileSync` once.  An earlier
 * version streamed line-by-line via `fs.appendFile` and was ~30× slower
 * for ~3 M galaxies thanks to per-line syscall overhead.  3 M short
 * strings are well under V8's string limits, so the all-in-memory build
 * is fine here.
 */
function writeTsvInput(path: string, positions: Float32Array, count: number): void {
  const lines: string[] = ['px py pz'];
  for (let i = 0; i < count; i++) {
    lines.push(
      `${positions[i * 3 + 0]!} ${positions[i * 3 + 1]!} ${positions[i * 3 + 2]!}`,
    );
  }
  // Unconditional mkdirSync with `recursive: true` is a no-op when the
  // directory already exists, and avoids a TOCTOU window between the
  // existsSync probe and the mkdir call.
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.join('\n') + '\n');
}

/**
 * Run `delaunay_3D` to build a Delaunay tessellation of the point set
 * and return the path to the resulting `.NDnet` file.
 *
 * Why this stage exists at all
 * ----------------------------
 * `mse` does not consume raw point clouds — it expects an N-d simplicial
 * complex (a "network" in DisPerSE-speak, the `.NDnet` format) annotated
 * with a per-vertex scalar field.  For an unstructured galaxy point set
 * the natural complex is the Delaunay tessellation, and the natural
 * scalar field is the Delaunay Tessellation Field Estimator (DTFE)
 * density at each vertex.  Both are produced by `delaunay_3D` (which
 * links against CGAL for the tessellation itself); the resulting
 * `.NDnet` carries DTFE values in its `field_value` field, which `mse`
 * then treats as the function whose Morse-Smale complex defines the
 * cosmic-web filaments.
 *
 * Why we got this wrong before
 * ----------------------------
 * The previous `runDisperse` skipped this stage and handed the raw TSV
 * directly to `mse`.  `mse` accepts a TSV/ASCII-survey only when it can
 * find a per-vertex scalar field already declared in the file (e.g. from
 * a FITS image or pre-built NDnet); on a plain `px py pz` survey it
 * silently produces no output and exits, which is what made `skelconv`
 * (the next stage) fall over with a `null` exit status.  The DisPerSE
 * README documents this as a three-step pipeline (delaunay → mse →
 * skelconv) but the older two-step recipe at the top of the README is
 * for *image* inputs (FITS), not point sets.
 *
 * Output filename gotcha
 * ----------------------
 * `delaunay_3D` writes the NDnet using the *basename* of the input
 * (directory stripped) into the current working directory — not next to
 * the input file.  Verified empirically with a 200-point test: input
 * `/path/to/test_pts.tsv` produces `<cwd>/test_pts.tsv.NDnet`.  We work
 * around this by setting `cwd` to the input's directory, so the NDnet
 * lands where the rest of the pipeline expects.
 */
function runDelaunay3D(tsvPath: string): string {
  const inputDir = dirname(tsvPath);
  const inputBase = basename(tsvPath);
  const ndnetPath = resolve(inputDir, `${inputBase}.NDnet`);

  // Resume: if a previous run already built the Delaunay tessellation,
  // skip this stage.  delaunay_3D is deterministic (the tessellation of a
  // fixed point set is unique up to floating-point ties broken by CGAL's
  // exact predicates), so the cached file is always valid for the same
  // input.  The TSV writer above is fast (~3 s for 2.5 M galaxies); the
  // tessellation itself is ~14 s, also cheap, but the output is ~1 GB
  // and re-writing it on every run is wasteful when the next stage may
  // be the one that crashed.  See the resume rationale on `runDisperse`
  // below for the wider story.
  if (existsSync(ndnetPath)) {
    process.stderr.write(
      `  found existing Delaunay tessellation at ${ndnetPath} — skipping delaunay_3D\n`,
    );
    return ndnetPath;
  }

  process.stderr.write(`running delaunay_3D on ${tsvPath}…\n`);
  const r = spawnSync('delaunay_3D', [tsvPath], {
    stdio: 'inherit',
    cwd: inputDir,
  });
  if (r.status !== 0) {
    throw new Error(`delaunay_3D failed with exit code ${r.status}`);
  }
  if (!existsSync(ndnetPath)) {
    throw new Error(
      `delaunay_3D exited 0 but expected output ${ndnetPath} is missing`,
    );
  }
  return ndnetPath;
}

/**
 * Run `mse` and `skelconv` on the Delaunay tessellation produced upstream
 * and return the path of the ASCII NDskl file the parser will consume.
 *
 *   1. `mse` extracts the Morse-Smale complex from the NDnet and writes
 *      a binary up-skeleton next to it.  `-upSkl` asks for the up-
 *      skeleton (filaments along ascending density gradient);
 *      `-forceLoops` keeps closed loops in the cosmic web;
 *      `-robustness` computes the per-arc robustness measure (without
 *      it, skelconv's `-trimBelow robustness` aborts with a missing-
 *      field error); `-nsig N` sets the persistence cut in σ.
 *
 *   2. `skelconv` smooths the skeleton, trims segments below the
 *      robustness threshold, and converts the binary to ASCII so the
 *      JS parser doesn't have to decode the proprietary binary form.
 *
 * Output filename gotchas
 * -----------------------
 * Verified empirically against DisPerSE 0.9.25:
 *   - mse writes `<cwd>/<basename(NDnet)>_s<nsig>.up.NDskl`.  Note the
 *     directory of the input is stripped (same gotcha as delaunay_3D)
 *     and the suffix is `_s<N>` not `.s<N>`.
 *   - skelconv with `-smooth N -trimBelow robustness X -to NDskl_ascii`
 *     writes `<input>.S<smooth-zero-padded-3>.TRIM.a.NDskl`.  The "S"
 *     suffix tracks the *smoothing* count, not the cut value (an earlier
 *     version of this script assumed `S<cut>`).  TRIM is appended only
 *     when `-trimBelow` was supplied; "a" marks the ASCII output.
 *
 * Note on flag syntax
 * -------------------
 * mse uses single-dash flags (`-upSkl`, not `--upSkl`).  Passing
 * double-dash forms causes mse to print "What is --upSkl ???" to
 * stdout, exit 0, and produce no output — exactly the silent failure
 * that previously cascaded into a NULL-status skelconv crash.
 *
 * Argv style
 * ----------
 * We use `spawnSync` with the array argv form rather than `execSync`
 * with template-string interpolation: the array form bypasses the shell
 * entirely, so paths with spaces (the project's SDSS CSV already lives
 * at `Skyserver_SQL5_3_2026 6_09_20 PM.csv`) or shell metacharacters in
 * the input path don't break the invocation.  Each step explicitly
 * checks the exit code and throws with the binary name + status so the
 * outer error handler can report something actionable.
 */
function runDisperse(ndnetPath: string, cut: number, smooth: number): string {
  const inputDir = dirname(ndnetPath);
  const ndnetBase = basename(ndnetPath);
  const mscPath = resolve(inputDir, `${ndnetBase}.MSC`);
  const skelRaw = resolve(inputDir, `${ndnetBase}_s${cut}.up.NDskl`);

  // ── Resume policy ───────────────────────────────────────────────────────
  //
  // The mse stage runs in two halves: build the Morse-Smale complex
  // (~22 min wall-clock for 2.5 M galaxies; writes `<ndnet>.MSC`) and
  // then compute persistence pairs + emit the up-skeleton (`.up.NDskl`).
  // The MSC half is the expensive one — 132 kCPU-seconds across threads
  // in the production run.  If a run is interrupted *between* the two
  // halves (e.g. an agent's wall-clock timeout SIGKILL'd the wrapper
  // after MSC was on disk but before the skeleton was), restarting from
  // scratch redoes the expensive half for no reason.
  //
  // mse's `-loadMSC <fname>` flag exists exactly for this case: skip the
  // gradient + complex-construction passes, jump straight to persistence
  // pairs against the cached MSC.  We branch into three paths:
  //
  //   1. `.up.NDskl` already exists → skip mse entirely.  An ascii-skel
  //      pass might still need to run if the user changed `--smooth`,
  //      but the binary skeleton is reusable across smoothing values.
  //   2. `.MSC` exists but `.up.NDskl` doesn't → run mse with
  //      `-loadMSC <mscPath>` so the heavy compute is reused.  Same
  //      `-nsig`, `-upSkl`, `-forceLoops`, `-robustness` flags as the
  //      from-scratch path: these control the persistence-pair phase
  //      and the skeleton output, not the MSC build, so they're still
  //      load-bearing here.
  //   3. Neither exists → from-scratch run.
  //
  // Note: changing `--cut` *between* runs flows through `-nsig` to the
  // persistence-pair phase, which is downstream of the MSC; the cached
  // MSC is still valid.  So `-loadMSC` is safe across cut sweeps too.
  // (Re-tessellating with delaunay_3D is the only stage that depends on
  // input geometry, and that stage is also cached upstream.)
  if (existsSync(skelRaw)) {
    process.stderr.write(
      `  found existing up-skeleton at ${skelRaw} — skipping mse\n`,
    );
  } else if (existsSync(mscPath)) {
    process.stderr.write(
      `  found existing MSC at ${mscPath} — resuming mse with -loadMSC\n`,
    );
    const mseResult = spawnSync(
      'mse',
      [
        ndnetPath,
        '-loadMSC',
        mscPath,
        '-upSkl',
        '-forceLoops',
        '-robustness',
        '-nsig',
        String(cut),
      ],
      { stdio: 'inherit', cwd: inputDir },
    );
    if (mseResult.status !== 0) {
      throw new Error(`mse (loadMSC) failed with exit code ${mseResult.status}`);
    }
    if (!existsSync(skelRaw)) {
      throw new Error(
        `mse -loadMSC exited 0 but expected output ${skelRaw} is missing — ` +
          'the cached MSC may be stale relative to the .NDnet input; ' +
          `delete ${mscPath} and re-run to rebuild from scratch.`,
      );
    }
  } else {
    process.stderr.write(`running mse on ${ndnetPath} (this can take hours)…\n`);
    const mseResult = spawnSync(
      'mse',
      [ndnetPath, '-upSkl', '-forceLoops', '-robustness', '-nsig', String(cut)],
      { stdio: 'inherit', cwd: inputDir },
    );
    if (mseResult.status !== 0) {
      throw new Error(`mse failed with exit code ${mseResult.status}`);
    }
    if (!existsSync(skelRaw)) {
      throw new Error(
        `mse exited 0 but expected output ${skelRaw} is missing — ` +
          'check stderr for "What is ... ???" (flag spelling) or a quietly skipped pass.',
      );
    }
  }

  process.stderr.write(`running skelconv (smooth=${smooth})…\n`);
  const skelResult = spawnSync(
    'skelconv',
    [
      skelRaw,
      '-smooth',
      String(smooth),
      '-trimBelow',
      'robustness',
      String(cut),
      '-to',
      'NDskl_ascii',
    ],
    { stdio: 'inherit', cwd: inputDir },
  );
  if (skelResult.status !== 0) {
    throw new Error(`skelconv failed with exit code ${skelResult.status}`);
  }
  // skelconv zero-pads the smoothing count to width 3 ("S002" not "S2").
  const smoothTag = String(smooth).padStart(3, '0');
  const asciiPath = `${skelRaw}.S${smoothTag}.TRIM.a.NDskl`;
  if (!existsSync(asciiPath)) {
    throw new Error(
      `skelconv exited 0 but expected output ${asciiPath} is missing`,
    );
  }
  return asciiPath;
}

async function main(): Promise<void> {
  const { cut, smooth } = parseArgs();
  process.stderr.write(`buildFilaments — cut=${cut}σ smooth=${smooth}\n`);

  checkDisperse();

  const { count, positions } = readMergedPositions();
  process.stderr.write(`  merged ${count.toLocaleString()} galaxy positions\n`);

  const tsvPath = resolve('data/raw/galaxies_merged.tsv');
  writeTsvInput(tsvPath, positions, count);
  process.stderr.write(`  wrote ${tsvPath}\n`);

  // Three-stage DisPerSE pipeline: build the Delaunay tessellation +
  // DTFE field, then extract the persistent skeleton, then convert to
  // ASCII.  See the per-function headers for filename gotchas.
  const ndnetPath = runDelaunay3D(tsvPath);
  process.stderr.write(`  built Delaunay tessellation at ${ndnetPath}\n`);

  const ndsklPath = runDisperse(ndnetPath, cut, smooth);
  process.stderr.write(`  parsed skeleton at ${ndsklPath}\n`);

  const skel = parseNDskl(readFileSync(ndsklPath, 'utf8'));
  const cloud = skeletonToFilamentCloud(skel);
  process.stderr.write(
    `  ${cloud.stripCount.toLocaleString()} strips, ` +
      `${cloud.vertexCount.toLocaleString()} vertices\n`,
  );

  const outPath = resolve('public/data/filaments.bin');
  const buf = encodeFilaments(cloud);
  writeFileSync(outPath, Buffer.from(buf));
  process.stderr.write(
    `wrote filaments.bin (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB)\n`,
  );
}

// Only run when this file is invoked directly (e.g. via `tsx`).  This
// mirrors the buildAllBins pattern so a future test can import helpers
// from this module without triggering DisPerSE.
const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(
      `error: ${(err as Error).stack ?? (err as Error).message}\n`,
    );
    process.exit(1);
  });
}
