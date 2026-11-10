//! cloud-bake-rs: bakes one UTC day's global cloud-opacity map. Stages: load sources, join them into a
//! composite, fill the gaps from time-matched geostationary IR, write an 8192x4096 WebP. stdout carries
//! exactly one JSON line (summary.rs); everything else goes to stderr. Exit: 0 written, 2 usage, 3 data,
//! 4 calibration drift (see the spec); a panic is 1.
mod blend;
mod cli;
mod composite;
mod date;
mod edt;
mod fetch;
mod filters;
mod geodecode;
mod geofill;
mod grid;
mod imageio;
mod label;
mod maxflow;
mod orbit;
mod probe;
mod quantile;
mod seam;
mod sources;
mod sources_table;
mod summary;
mod verdict;

use grid::{smoothstep, subsample, H, W};
use rayon::prelude::*;

fn usage_error(msg: &str) -> ! {
    eprintln!("cloud-bake-rs: {msg}");
    std::process::exit(2)
}

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let a = cli::parse_args(&argv).unwrap_or_else(|e| usage_error(&e));
    for p in [&a.baseline, &a.blue_marble] {
        if !p.is_file() {
            usage_error(&format!("cannot read {}", p.display()));
        }
    }
    let mut run = summary::Summary::new(a.date, a.out.clone());
    let fail = |run: &summary::Summary, code: i32, msg: &str| -> ! {
        eprintln!("cloud-bake-rs: {msg}");
        run.finish(code)
    };
    let day = fetch::day_dir(&a.cache, a.date);
    let (granules, mosaics_dir, geo) = (day.join("granules"), day.join("mosaics"), day.join("geo"));
    eprintln!(
        "baking {} (threads: {})",
        a.date,
        rayon::current_num_threads()
    );
    let dec = geodecode::Decoder::new();
    let cal = probe::probe(a.date, &a.cache, a.offline, &dec).unwrap_or_else(|e| fail(&run, 3, &e));
    run.calibration =
        serde_json::json!({"mtg_goes_e_k": cal.mtg_goes_e_k, "mtg_iodc_k": cal.mtg_iodc_k});
    if let Some(m) = verdict::drift(&cal) {
        fail(&run, 4, &m);
    }
    let (footprints, slot_pieces) = fetch::granules(&granules, a.date, !a.offline);
    let fit = orbit::fit(&footprints).unwrap_or_else(|e| fail(&run, 3, &e));
    drop(footprints);
    run.orbit = serde_json::json!({"tn": fit.orbit.tn, "lon_n": fit.orbit.lon_n, "ltan": fit.ltan, "median_dt_min": fit.median_dt_min});
    eprintln!(
        "orbit: tn {:.2} min, lon_n {:.2}, LTAN {:.2} h, median |dt| {:.2} min",
        fit.orbit.tn, fit.orbit.lon_n, fit.ltan, fit.median_dt_min
    );
    fetch::mosaics(&mosaics_dir, a.date, !a.offline).unwrap_or_else(|e| fail(&run, 3, &e));

    let ice = imageio::ice_sheets(&a.blue_marble);
    let base: Vec<f32> = imageio::baseline(&a.baseline)
        .par_iter()
        .map(|&v| v as f32 / 255.0)
        .collect();
    let lut = sources::opacity_lut();
    let mut orbits = sources::load_orbits(&slot_pieces, &lut);
    let mosaics = sources::load_mosaics(&mosaics_dir, &lut);
    let display = quantile::qmatch(
        &subsample(&mosaics[0].op, H, W, 4),
        &subsample(&base, H, W, 4),
        &subsample(&mosaics[0].valid, H, W, 4),
    );
    sources::hybridise(&mut orbits, &mosaics[0]);

    let srcs: Vec<sources::Source> = orbits.into_iter().chain(mosaics).collect();
    let comp = composite::Composite::build(srcs, &display, &base);

    let d = edt::edt(&comp.cv, H, W, 0);
    let wgt: Vec<f32> = d
        .par_iter()
        .zip(&ice)
        .map(|(&d, &i)| smoothstep(0.0, 1.0, d / 80.0) * (1.0 - i))
        .collect();
    drop(d);
    let orb = fit.orbit;
    let x = geofill::Inputs {
        labels: &comp.labels,
        swaths: &comp.swaths,
        cv: &comp.cv,
        op: &comp.op,
        wgt: &wgt,
        ice: &ice,
        base: &base,
        date: a.date,
    };
    let (fill, cov) = geofill::build_fill(&x, &orb, &dec, &geo, !a.offline);
    let coverage = verdict::coverage(&wgt, &cov);
    run.coverage = serde_json::json!(coverage);
    eprintln!("coverage {coverage:.3}");
    if coverage < verdict::MIN_COVERAGE {
        fail(
            &run,
            3,
            &format!(
                "coverage {coverage:.3} is below the floor {:.3}",
                verdict::MIN_COVERAGE
            ),
        );
    }
    drop(cov);

    let out: Vec<f32> = (0..W * H)
        .into_par_iter()
        .map(|i| wgt[i] * comp.op[i] + (1.0 - wgt[i]) * fill[i])
        .collect();
    let g = imageio::to_u8(&out);
    drop((out, fill, wgt));
    let bytes = imageio::write_webp(&a.out, &g, W, H);
    eprintln!(
        "wrote {} ({:.1} MB); sources: {}",
        a.out.display(),
        bytes as f64 / 1e6,
        fetch::stats_line()
    );
    run.finish(0)
}
