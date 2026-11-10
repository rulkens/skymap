//! cloud-bake-rs — the phase-2 seam-blended VIIRS cloud bake (seam_viirs_p2.py, P2_FLOW=0) as a native
//! binary. Stages: load sources, join them into a composite, fill the gaps from time-matched geostationary
//! IR (or, with --no-geofill, from the 12:00Z geo-ir.webp), write an 8192x4096 lossless RGBA WebP.
mod alloc;
mod blend;
mod composite;
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
use std::path::PathBuf;

/// Process CPU seconds (user + sys, all threads): on a shared machine wall time is noisy, CPU time is not.
fn cpu_secs() -> f64 {
    // SAFETY: getrusage only writes the struct it is given.
    let mut u: libc::rusage = unsafe { std::mem::zeroed() };
    unsafe { libc::getrusage(libc::RUSAGE_SELF, &mut u) };
    let tv = |t: libc::timeval| t.tv_sec as f64 + t.tv_usec as f64 * 1e-6;
    tv(u.ru_utime) + tv(u.ru_stime)
}

#[derive(Clone, Copy)]
pub struct Stamp {
    wall: std::time::Instant,
    cpu: f64,
}

impl Stamp {
    pub fn now() -> Stamp {
        Stamp {
            wall: std::time::Instant::now(),
            cpu: cpu_secs(),
        }
    }

    pub fn elapsed(&self) -> std::time::Duration {
        self.wall.elapsed()
    }
}

/// Per-stage (wall, cpu) seconds, in first-seen order; repeated names accumulate.
#[derive(Default)]
pub struct Timer {
    v: Vec<(String, f64, f64)>,
}

impl Timer {
    fn add_both(&mut self, name: &str, wall: f64, cpu: f64) {
        match self.v.iter_mut().find(|e| e.0 == name) {
            Some(e) => (e.1, e.2) = (e.1 + wall, e.2 + cpu),
            None => self.v.push((name.to_owned(), wall, cpu)),
        }
    }

    /// Wall-only seconds (network waits).
    pub fn add_secs(&mut self, name: &str, s: f64) {
        self.add_both(name, s, 0.0);
    }

    pub fn add(&mut self, name: &str, since: Stamp) {
        self.add_both(
            name,
            since.wall.elapsed().as_secs_f64(),
            cpu_secs() - since.cpu,
        );
    }

    /// Time since `since` not already booked under `parts`.
    fn add_residual(&mut self, name: &str, since: Stamp, parts: &[&str]) {
        let (mut w, mut c) = (since.wall.elapsed().as_secs_f64(), cpu_secs() - since.cpu);
        for e in self.v.iter().filter(|e| parts.contains(&e.0.as_str())) {
            (w, c) = (w - e.1, c - e.2);
        }
        self.add_both(name, w, c);
    }
}

struct Args {
    bake: PathBuf,
    textures: PathBuf,
    out: PathBuf,
    fetch: bool,
    geofill: bool,
    geo_ir: Option<PathBuf>,
    compare: Option<PathBuf>,
    webp_method: i32,
    webp_quality: f32,
    webp_image_crate: Option<PathBuf>,
    dump: Option<PathBuf>,
    threads: Option<usize>,
}

fn args() -> Args {
    let mut a = Args {
        bake: PathBuf::new(),
        textures: PathBuf::new(),
        out: PathBuf::new(),
        fetch: false,
        geofill: true,
        geo_ir: None,
        compare: None,
        webp_method: 4,
        webp_quality: 25.0,
        webp_image_crate: None,
        dump: None,
        threads: None,
    };
    let mut it = std::env::args().skip(1);
    while let Some(k) = it.next() {
        let mut val = || PathBuf::from(it.next().unwrap_or_else(|| panic!("{k} needs a value")));
        match k.as_str() {
            "--bake" => a.bake = val(),
            "--textures" => a.textures = val(),
            "--out" => a.out = val(),
            "--fetch" => a.fetch = true,
            "--no-geofill" => a.geofill = false,
            "--geo-ir" => a.geo_ir = Some(val()),
            "--compare" => a.compare = Some(val()),
            "--webp-method" => a.webp_method = val().to_str().unwrap().parse().unwrap(),
            "--webp-quality" => a.webp_quality = val().to_str().unwrap().parse().unwrap(),
            "--webp-image-crate" => a.webp_image_crate = Some(val()),
            "--dump" => a.dump = Some(val()),
            "--threads" => a.threads = Some(val().to_str().unwrap().parse().unwrap()),
            _ => panic!("unknown argument {k} (see README)"),
        }
    }
    assert!(
        !a.bake.as_os_str().is_empty()
            && !a.textures.as_os_str().is_empty()
            && !a.out.as_os_str().is_empty(),
        "--bake, --textures and --out are required"
    );
    assert!(
        a.geofill || a.geo_ir.is_some(),
        "--no-geofill needs --geo-ir <geo-ir.webp>"
    );
    a
}

/// Raw composite stage outputs (op f32, cv u8, labels i8; row-major 8192x4096) for stage-wise parity.
fn dump(dir: &std::path::Path, c: &composite::Composite) {
    std::fs::create_dir_all(dir).unwrap();
    let op: Vec<u8> = c.op.iter().flat_map(|v| v.to_le_bytes()).collect();
    std::fs::write(dir.join("op.f32"), op).unwrap();
    std::fs::write(
        dir.join("cv.u8"),
        c.cv.iter().map(|&b| b as u8).collect::<Vec<u8>>(),
    )
    .unwrap();
    std::fs::write(
        dir.join("labels.i8"),
        c.labels.iter().map(|&l| l as u8).collect::<Vec<u8>>(),
    )
    .unwrap();
}

/// Mean and p99 absolute alpha difference against a reference WebP (in 0..255 units).
fn compare(out: &[u8], reference: &std::path::Path) {
    let r = imageio::alpha(reference);
    let mut hist = [0usize; 256];
    for (a, b) in out.iter().zip(&r) {
        hist[a.abs_diff(*b) as usize] += 1;
    }
    let n = out.len() as f64;
    let mean = hist
        .iter()
        .enumerate()
        .map(|(d, &c)| d as f64 * c as f64)
        .sum::<f64>()
        / n;
    let pct = |p: f64| {
        let mut acc = 0usize;
        hist.iter().position(|&c| {
            acc += c;
            acc as f64 >= p * n
        })
    };
    let over = |t: usize| hist[t + 1..].iter().sum::<usize>() as f64 / n;
    println!(
        "parity vs {}: mean |d| {mean:.3} /255, p99 {:?}, p99.9 {:?}, max {:?}, identical {:.3}, >2 {:.4}, >8 {:.4}, >32 {:.5}",
        reference.display(),
        pct(0.99),
        pct(0.999),
        hist.iter().rposition(|&c| c > 0),
        hist[0] as f64 / n,
        over(2),
        over(8),
        over(32)
    );
}

fn main() {
    let a = args();
    if let Some(n) = a.threads {
        rayon::ThreadPoolBuilder::new()
            .num_threads(n)
            .build_global()
            .unwrap();
    }
    let t00 = Stamp::now();
    let mut t = Timer::default();
    println!("threads: {}", rayon::current_num_threads());
    let (granules, viirs, geo_p2) = (
        a.bake.join("granules"),
        a.bake.join("viirs"),
        a.bake.join("geo_p2"),
    );
    if a.fetch {
        t.add_secs("fetch: granules", fetch::granules(&granules));
        t.add_secs("fetch: mosaics", fetch::mosaics(&viirs));
        println!("  fetched sources: {}", fetch::stats_line());
    }

    let t0 = Stamp::now();
    let ice = imageio::ice_sheets(&a.textures.join("world.topo.bathy.200412.3x21600x10800.jpg"));
    t.add("load: ice sheets (Blue Marble)", t0);
    let t0 = Stamp::now();
    let base: Vec<f32> = imageio::baseline(&a.textures.join("cloud_combined_8192.tif"))
        .par_iter()
        .map(|&v| v as f32 / 255.0)
        .collect();
    t.add("load: baseline", t0);
    let lut = sources::opacity_lut();
    let t0 = Stamp::now();
    let mut orbits = sources::load_orbits(&granules, &lut);
    t.add("load: granules", t0);
    let t0 = Stamp::now();
    let mosaics = sources::load_mosaics(&viirs, &lut);
    t.add("load: mosaics", t0);
    let t0 = Stamp::now();
    let display = quantile::qmatch(
        &subsample(&mosaics[0].op, H, W, 4),
        &subsample(&base, H, W, 4),
        &subsample(&mosaics[0].valid, H, W, 4),
    );
    sources::hybridise(&mut orbits, &mosaics[0]);
    t.add("load: hybridise", t0);

    let srcs: Vec<sources::Source> = orbits.into_iter().chain(mosaics).collect();
    let t0 = Stamp::now();
    let comp = composite::Composite::build(srcs, &display, &base, &mut t);
    t.add_residual(
        "composite: other",
        t0,
        &["composite: cut", "composite: blend", "holes + match"],
    );

    let t0 = Stamp::now();
    if let Some(dir) = &a.dump {
        dump(dir, &comp);
    }
    let d = edt::edt(&comp.cv, H, W, 0);
    let wgt: Vec<f32> = d
        .par_iter()
        .zip(&ice)
        .map(|(&d, &i)| smoothstep(0.0, 1.0, d / 80.0) * (1.0 - i))
        .collect();
    drop(d);
    t.add("feather weight", t0);
    let fill = if a.geofill {
        let orb: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(granules.join("orbit.json")).unwrap())
                .unwrap();
        let orb = orbit::Orbit {
            tn: orb["tn"].as_f64().unwrap(),
            lon_n: orb["lon_n"].as_f64().unwrap(),
        };
        let colormap = a.bake.parent().unwrap().join("gibs/colormaps/ir.xml");
        let dec = geodecode::Decoder::new(&colormap, &geo_p2.join("calib.json"));
        let x = geofill::Inputs {
            labels: &comp.labels,
            names: &comp.names,
            cv: &comp.cv,
            op: &comp.op,
            wgt: &wgt,
            ice: &ice,
            base: &base,
        };
        geofill::build_fill(&x, &orb, &dec, &geo_p2.join("frames"), a.fetch, &mut t)
    } else {
        let t0 = Stamp::now();
        let f = imageio::alpha(a.geo_ir.as_ref().unwrap())
            .par_iter()
            .map(|&v| v as f32 / 255.0)
            .collect();
        t.add("fill: geo-ir.webp", t0);
        f
    };

    let t0 = Stamp::now();
    let out: Vec<f32> = (0..W * H)
        .into_par_iter()
        .map(|i| wgt[i] * comp.op[i] + (1.0 - wgt[i]) * fill[i])
        .collect();
    let g = imageio::to_u8(&out);
    drop((out, fill, wgt));
    t.add("final blend", t0);
    let t0 = Stamp::now();
    let bytes = imageio::write_webp(&a.out, &g, a.webp_method, a.webp_quality);
    t.add("webp write", t0);
    println!(
        "wrote {} ({:.1} MB, libwebp lossless method {} quality {})",
        a.out.display(),
        bytes as f64 / 1e6,
        a.webp_method,
        a.webp_quality
    );

    let (total, total_cpu) = (t00.elapsed().as_secs_f64(), cpu_secs() - t00.cpu);
    let fetch_s: f64 =
        t.v.iter()
            .filter(|e| e.0.starts_with("fetch"))
            .map(|e| e.1)
            .sum();
    println!("timing (s):                            wall     cpu");
    for (n, w, c) in &t.v {
        println!("  {n:<34} {w:7.2} {c:7.2}");
    }
    println!(
        "  {:<34} {:7.2} {total_cpu:7.2}",
        "total compute (excl. fetch)",
        total - fetch_s
    );
    println!("  {:<34} {:7.2}", "total wall", total);
    println!(
        "peak Rust heap: {:.2} GB (C allocations in libwebp / libjpeg not counted)",
        alloc::peak_gb()
    );
    if a.fetch {
        println!("  fetched overall: {}", fetch::stats_line());
    }

    if let Some(p) = &a.webp_image_crate {
        let t0 = Stamp::now();
        let n = imageio::write_webp_image_crate(p, &g);
        println!(
            "image-crate lossless encoder: {:.1} MB in {:.1} s",
            n as f64 / 1e6,
            t0.elapsed().as_secs_f64()
        );
    }
    if let Some(r) = &a.compare {
        compare(&g, r);
    }
}
