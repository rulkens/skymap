//! cloud-bake-rs: bakes one UTC day's global cloud-opacity map. Stages: load sources, join them into a
//! composite, fill the gaps from time-matched geostationary IR, write an 8192x4096 lossless RGBA WebP.
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
mod quantile;
mod seam;
mod sources;

use grid::{smoothstep, subsample, H, W};
use rayon::prelude::*;

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let a = match cli::parse_args(&argv) {
        Ok(a) => a,
        Err(e) => {
            eprintln!("cloud-bake-rs: {e}");
            std::process::exit(2);
        }
    };
    let t00 = std::time::Instant::now();
    let day = fetch::day_dir(&a.cache, a.date);
    let (granules, mosaics_dir, geo) = (day.join("granules"), day.join("mosaics"), day.join("geo"));
    println!(
        "baking {} (threads: {})",
        a.date,
        rayon::current_num_threads()
    );
    let footprints = fetch::granules(&granules, a.date, !a.offline);
    let fit = match orbit::fit(&footprints) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("cloud-bake-rs: {e}");
            std::process::exit(3);
        }
    };
    drop(footprints);
    println!(
        "orbit: tn {:.2} min, lon_n {:.2}, LTAN {:.2} h, median |dt| {:.2} min",
        fit.tn, fit.lon_n, fit.ltan, fit.median_dt_min
    );
    fetch::mosaics(&mosaics_dir, a.date, !a.offline);

    let ice = imageio::ice_sheets(&a.blue_marble);
    let base: Vec<f32> = imageio::baseline(&a.baseline)
        .par_iter()
        .map(|&v| v as f32 / 255.0)
        .collect();
    let lut = sources::opacity_lut();
    let mut orbits = sources::load_orbits(&granules, &lut);
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
    let orb = orbit::Orbit {
        tn: fit.tn,
        lon_n: fit.lon_n,
    };
    let dec = geodecode::Decoder::new();
    let x = geofill::Inputs {
        labels: &comp.labels,
        names: &comp.names,
        cv: &comp.cv,
        op: &comp.op,
        wgt: &wgt,
        ice: &ice,
        base: &base,
        date: a.date,
    };
    let fill = geofill::build_fill(&x, &orb, &dec, &geo, !a.offline);

    let out: Vec<f32> = (0..W * H)
        .into_par_iter()
        .map(|i| wgt[i] * comp.op[i] + (1.0 - wgt[i]) * fill[i])
        .collect();
    let g = imageio::to_u8(&out);
    drop((out, fill, wgt));
    let bytes = imageio::write_webp(&a.out, &g);
    println!(
        "wrote {} ({:.1} MB) in {:.1} s; sources: {}",
        a.out.display(),
        bytes as f64 / 1e6,
        t00.elapsed().as_secs_f64(),
        fetch::stats_line()
    );
}
