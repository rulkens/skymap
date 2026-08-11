//! stars-rs — speed-first Rust port of the Gaia star-bin build pipeline
//! (`tools/stars/buildStars.ts` is the executable spec; the on-disk SKST
//! format in `src/data/starCatalog/starCatalogFormat.ts` is LOCKED).
//!
//! Pipeline: stream 256 Gaia CSV pages → resolve distances (photogeo → geo →
//! GCNS) → place (ra/dec/dist → heliocentric parsecs) → set-formula dedup
//! (GCNS-only supplements; Hipparcos bright patch; famous + HIP↔Gaia
//! subtraction) → quantize once into a 1024³ Morton grid → per tier, binary-
//! search the largest brightness cutoff k whose gzipped catalog fits the
//! byte budget → write `stars-{small,medium,large}.bin`.
//!
//! ── Parallelism & determinism ─────────────────────────────────────────────
//!
//! Every parallel stage is deterministic independent of thread count:
//!   - page parse: parallel map, concatenated in sorted page order;
//!   - drop counters: integer sums (order-free);
//!   - bounding box: min/max reduction (associative + commutative);
//!   - brightness ranking: rayon's *stable* par_sort (tie order = population
//!     order, same as TS TimSort);
//!   - the population-wide selection sort: unstable par_sort over unique
//!     keys (unique ⇒ one valid result);
//!   - flux merges: sequential per node in ascending-Morton child order;
//!   - the three tier searches: independent, sharing only a memoised
//!     `k → gzip size` map (pure function of k).
//!
//! Usage:
//!   cargo run --release -- [--data <gaia dir>] [--out <dir>]
//!                          [--pages <n>] [--compare <ref bin dir>]

mod compare;
mod constellations;
mod format;
mod morton;
mod octree;
mod parse;
mod population;
mod taper;
mod tiers;

use compare::{compare_aggregates, compare_leaves, decode_bin, DecodedBin};
use constellations::{
    build_artifact, bright_population, load_famous_seed, load_overrides, parse_lines, ResolveError,
};
use population::{build_population, derive_grid, quantize_population, DEFAULT_MORTON_BITS, Population};
use rustc_hash::FxHashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;
use tiers::{build_tier, TIER_NAMES};

struct Args {
    data_dir: PathBuf,
    out_dir: PathBuf,
    max_pages: Option<usize>,
    compare_dir: Option<PathBuf>,
    /// Repo root, anchored to the crate location — the constellation build reads
    /// its vendored line data + seeds relative to this, independent of `--data`.
    repo_root: PathBuf,
}

fn parse_args() -> Args {
    // Defaults are anchored to the crate location (tools/stars-rs → repo
    // root two levels up) so `cargo run` behaves the same from any CWD.
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let mut args = Args {
        data_dir: repo_root.join("data/raw/gaia"),
        out_dir: repo_root.join("public/data"),
        max_pages: None,
        compare_dir: None,
        repo_root,
    };
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < argv.len() {
        let value = || argv.get(i + 1).unwrap_or_else(|| panic!("missing value for {}", argv[i]));
        match argv[i].as_str() {
            "--data" => args.data_dir = PathBuf::from(value()),
            "--out" => args.out_dir = PathBuf::from(value()),
            "--pages" => args.max_pages = Some(value().parse().expect("--pages")),
            "--compare" => args.compare_dir = Some(PathBuf::from(value())),
            other => panic!("unknown flag {other}"),
        }
        i += 2;
    }
    args
}

fn main() {
    let args = parse_args();
    let t0 = Instant::now();

    // ── Parse (supplements first — the Gaia pass joins against them) ──────
    eprintln!("parsing GCNS + Hipparcos-2 + cross-match…");
    let gcns = parse::parse_gcns(&args.data_dir.join("gcns_main.csv"));
    let (hip_rows, hip_skipped) = parse::parse_hipparcos2(&args.data_dir.join("hip2.dat"));
    let hip_xmatch = parse::parse_hip_xmatch(&args.data_dir.join("hip2_best_neighbour.csv"));
    eprintln!(
        "  {} GCNS rows; {} Hipparcos rows (skipped {}); {} HIP→source_id pairs  [{:.1}s]",
        gcns.len(),
        hip_rows.len(),
        hip_skipped,
        hip_xmatch.len(),
        t0.elapsed().as_secs_f64()
    );

    eprintln!("streaming Gaia main catalog…");
    let gaia = parse::parse_gaia_pages(&args.data_dir, args.max_pages);
    eprintln!(
        "  {} Gaia main-catalog rows  [{:.1}s]",
        gaia.len(),
        t0.elapsed().as_secs_f64()
    );

    // ── Population: resolve + place + set formula + clamps ────────────────
    eprintln!("building population (resolve + dedup)…");
    let pop = build_population(&gaia, &gcns, &hip_rows, hip_skipped, &hip_xmatch);
    drop(gaia);
    eprintln!(
        "population ({} stars): drops noBailerJones {}, hipNonPositivePlx {}, \
         famousSubtracted {}, hipGaiaSubtracted {}, positionalGapSubtracted {}, \
         farDistance {}, noPhotometry {}; \
         clamps absMag {}, colorIdx {}  [{:.1}s]",
        pop.stars.len(),
        pop.drops.no_bailer_jones,
        pop.drops.hip_non_positive_plx,
        pop.drops.famous_subtracted,
        pop.drops.hip_gaia_subtracted,
        pop.drops.positional_gap_subtracted,
        pop.drops.far_distance,
        pop.drops.no_photometry,
        pop.clamps.abs_mag,
        pop.clamps.color_idx,
        t0.elapsed().as_secs_f64()
    );

    // ── Constellation overlay artifact ────────────────────────────────────
    // Runs here, while `pop` (stars + id sidecar) is still alive — the resolver
    // maps each stick-figure vertex back to a real star through those ids, so it
    // must precede the `drop(pop)` below. Reads its inputs relative to the repo
    // root (independent of `--data`) and writes public/data/constellations.json.
    emit_constellations(&args, &pop, t0.elapsed().as_secs_f64());

    // ── Quantize once; sort once ──────────────────────────────────────────
    let grid = derive_grid(&pop.stars, DEFAULT_MORTON_BITS);
    eprintln!(
        "grid: origin ({:.3}, {:.3}, {:.3}) pc, cellEdge {:.6} pc, {} bits/axis",
        grid.origin[0], grid.origin[1], grid.origin[2], grid.cell_edge_pc, grid.morton_bits_per_axis
    );
    let q = quantize_population(&pop.stars, grid);
    drop(pop);
    eprintln!(
        "quantized: {} stars ({} supplement, {} main)  [{:.1}s]",
        q.sorted.len(),
        q.supplement_count,
        q.main_app_mags.len(),
        t0.elapsed().as_secs_f64()
    );

    // ── Tiers: three parallel binary searches over a shared probe cache ───
    let cache: Mutex<FxHashMap<u32, u64>> = Mutex::new(FxHashMap::default());
    let mut results: Vec<Option<tiers::TierResult>> = (0..3).map(|_| None).collect();
    rayon::scope(|s| {
        for (i, slot) in results.iter_mut().enumerate() {
            let q = &q;
            let cache = &cache;
            s.spawn(move |_| {
                *slot = Some(build_tier(q, i, cache));
            });
        }
    });

    let star_out_dir = args.out_dir.join(format!("star-catalog/v{}", format::VERSION));
    std::fs::create_dir_all(&star_out_dir).expect("create out dir");
    let mut any_over_budget = false;
    let mut finals: Vec<tiers::TierResult> = Vec::new();
    for r in results.into_iter().flatten() {
        let path = star_out_dir.join(format!("stars-{}.bin", r.tier));
        std::fs::write(&path, &r.encoded).expect("write bin");
        let g_cut = r
            .g_cut_mag
            .map(|g| format!("G<={g:.2}"))
            .unwrap_or_else(|| "supplement-only".into());
        eprintln!(
            "stars-{}: {} stars (k={}), {}, {} nodes, raw {} B -> gzip {} B (budget {} B){}",
            r.tier,
            r.star_count,
            r.k,
            g_cut,
            r.node_count,
            r.raw_bytes,
            r.compressed_bytes,
            r.budget_bytes,
            if r.over_budget { "  OVER BUDGET" } else { "" }
        );
        eprintln!("  wrote {}", path.display());
        any_over_budget |= r.over_budget;
        finals.push(r);
    }
    eprintln!("build complete in {:.1}s", t0.elapsed().as_secs_f64());

    // ── Optional equivalence report against the TS reference bins ─────────
    if let Some(ref_dir) = &args.compare_dir {
        for r in &finals {
            run_compare(&q, ref_dir, r);
        }
    }

    // Codec-ratio STOP gate, replicated from the TS CLI: never silently ship
    // an over-budget bin.
    if any_over_budget {
        eprintln!(
            "\nSTOP: one or more tiers overshoot their transfer budget by >20% under gzip — \
             the deferred codec-ratio gate. Escalating the codec is user-gated; report this."
        );
        std::process::exit(1);
    }
}

/// Resolve every constellation stick-figure vertex to a real star and write
/// `public/data/constellations.json`. An unresolvable vertex is a hard build
/// failure (spec-mandated) — never a silently dropped line. `build_artifact`
/// collects every unresolvable vertex across the whole run rather than
/// stopping at the first, so curating the override seed is one build per
/// batch of misses instead of one build per miss.
fn emit_constellations(args: &Args, pop: &Population, elapsed: f64) {
    let lines = parse_lines(&args.repo_root.join("data/raw/constellations/constellations.lines.json"));
    let famous = load_famous_seed(&args.repo_root.join("data/seeds/famous_stars.seed.json"));
    let overrides = load_overrides(&args.repo_root.join("data/seeds/constellation_overrides.seed.json"));
    // Scan only the naked-eye stars — the resolver never matches fainter ones.
    let bright = bright_population(pop);

    let (artifact, usage) = match build_artifact(&lines, &famous, &bright, &overrides) {
        Ok(a) => a,
        Err(errors) => {
            for e in &errors {
                let ResolveError::Unresolvable {
                    constellation,
                    vertex_index,
                    ra_deg,
                    dec_deg,
                    nearest_miss_arcmin,
                } = e;
                eprintln!(
                    "\nSTOP: constellation vertex has no star to anchor to.\n  \
                     constellation: {constellation}\n  vertex index:  {vertex_index}\n  \
                     sky position:  ra {ra_deg:.4}°, dec {dec_deg:.4}°\n  \
                     nearest miss:  {nearest_miss_arcmin:.2}′\n\
                     Add an override (HIP id or explicit position) for this vertex to \
                     data/seeds/constellation_overrides.seed.json and rebuild."
                );
            }
            eprintln!(
                "\n{} unresolvable vertex(es) total — see \
                 data/seeds/constellation_overrides.seed.json.",
                errors.len()
            );
            std::process::exit(1);
        }
    };

    std::fs::create_dir_all(&args.out_dir).expect("create out dir");
    let out = args.out_dir.join("constellations.json");
    let json = serde_json::to_string(&artifact).expect("serialize constellations artifact");
    std::fs::write(&out, json).expect("write constellations.json");

    let segments: usize = artifact.constellations.iter().map(|c| c.segments.len()).sum();
    eprintln!(
        "constellations: {} figures, {} segments (overrides {}/{} used, bright pop {})  [{:.1}s]",
        artifact.constellations.len(),
        segments,
        usage.used_count(),
        usage.total(),
        bright.stars.len(),
        elapsed
    );
    // An override earns its place only while the population still lacks a star at
    // its vertex; Gaia coverage improving can quietly retire one. Name each
    // unused entry so it can be pruned, same spirit as the drop/clamp counters —
    // not a failure, a curation signal.
    for i in usage.unused_indices() {
        let ov = &overrides.overrides[i];
        eprintln!(
            "  WARNING: unused override — {} vertex at ra {:.4}°, dec {:.4}° resolved \
             without it; prune it from data/seeds/constellation_overrides.seed.json.",
            ov.constellation, ov.ra, ov.dec
        );
    }
    eprintln!("  wrote {}", out.display());
}

/// Rebuild at the reference's star count and diff field-by-field (see
/// `compare.rs` for the pairing strategy and why k is re-derived).
fn run_compare(q: &population::Quantized, ref_dir: &Path, r: &tiers::TierResult) {
    let tier = r.tier;
    assert!(TIER_NAMES.contains(&tier));
    let ref_path = ref_dir.join(format!("stars-{tier}.bin"));
    let bytes = match std::fs::read(&ref_path) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("compare[{tier}]: cannot read {} ({e}) — skipped", ref_path.display());
            return;
        }
    };
    let reference = decode_bin(&bytes);
    let k_cmp = reference.star_count.saturating_sub(q.supplement_count);
    let cat = octree::build_catalog(&q.sorted, k_cmp, q.grid);
    let mine = DecodedBin {
        star_count: cat.star_count,
        morton_bits: cat.grid.morton_bits_per_axis,
        cell_edge_pc: cat.grid.cell_edge_pc as f32,
        origin: cat.grid.origin,
        nodes: cat.nodes,
        records: cat.records,
    };

    eprintln!("── equivalence[{tier}] vs {} ──", ref_path.display());
    eprintln!(
        "  header: mortonBits {} vs {}, cellEdgePc {:?} vs {:?} (Δ {:e}), origin Δ ({:e}, {:e}, {:e})",
        mine.morton_bits,
        reference.morton_bits,
        mine.cell_edge_pc,
        reference.cell_edge_pc,
        (mine.cell_edge_pc - reference.cell_edge_pc).abs(),
        (mine.origin[0] - reference.origin[0]).abs(),
        (mine.origin[1] - reference.origin[1]).abs(),
        (mine.origin[2] - reference.origin[2]).abs(),
    );
    eprintln!(
        "  counts: stars {} vs {} (compared at k={k_cmp}), nodes {} vs {}",
        mine.star_count,
        reference.star_count,
        mine.nodes.len(),
        reference.nodes.len()
    );
    let leaves = compare_leaves(&mine, &reference);
    let frac = |n: u64| n as f64 / leaves.compared.max(1) as f64 * 100.0;
    eprintln!(
        "  leaf records: {} paired, {} identical ({:.4}%), unpaired {} ({:.4}% of stars)",
        leaves.compared,
        leaves.identical,
        frac(leaves.identical),
        leaves.unpaired,
        leaves.unpaired as f64 / mine.star_count.max(1) as f64 * 100.0,
    );
    eprintln!(
        "    Δoffset bins [1,2,≥3]: {:?}; ΔabsMagIdx: {:?}; ΔcolorIdx: {:?}",
        leaves.offset_delta, leaves.abs_mag_delta, leaves.color_delta
    );
    let (aggs, structure) = compare_aggregates(&mine, &reference);
    eprintln!(
        "  aggregates: {} paired, {} identical ({:.4}%), unpaired {}, childMask mismatches {}",
        aggs.compared,
        aggs.identical,
        aggs.identical as f64 / aggs.compared.max(1) as f64 * 100.0,
        aggs.unpaired,
        structure
    );
    eprintln!(
        "    Δoffset bins [1,2,≥3]: {:?}; ΔabsMagIdx: {:?}; ΔcolorIdx: {:?}",
        aggs.offset_delta, aggs.abs_mag_delta, aggs.color_delta
    );
}
