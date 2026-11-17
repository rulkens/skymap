//! Cached WMS pulls into a per-day cache (`<cache>/YYYY-MM-DD/{granules,mosaics,geo,probe}`). With
//! `--offline` a cache miss counts as missing data, so a warm run never touches the network by accident.
//! A file that cannot be had is a skip, logged and counted, never a panic: callers drop that piece.
//! Every cache file is written as `<path>.part` and renamed, so a killed run leaves nothing cached.
use crate::date::Date;
use crate::grid::{H, W};
use crate::imageio::{is_blank, rgba, Rgba};
use crate::orbit::{Footprint, Footprints, FOOT_H, FOOT_W};
use crate::sources_table::{by_id, Host, Kind, Source};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

const GIBS: &str = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&SRS=EPSG:4326";
const EUM: &str = "https://view.eumetsat.int/geoserver/ows?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&SRS=EPSG:4326";

const PNG: &[u8] = b"\x89PNG";
const JPEG: &[u8] = b"\xff\xd8";

/// The request URL up to (not including) BBOX/WIDTH/HEIGHT/TIME.
fn layer_url(s: &Source) -> String {
    let base = match s.host {
        Host::Gibs => GIBS,
        Host::Eumetsat => EUM,
    };
    let format = match s.kind {
        Kind::Mosaic => "image/jpeg",
        _ => "image/png&TRANSPARENT=TRUE",
    };
    format!(
        "{base}&LAYERS={}&STYLES={}&FORMAT={format}",
        s.layer, s.styles
    )
}

/// Why an input is skipped. `Missing`: the server never gave a body. `Broken`: it gave one that is
/// not the image asked for (a WMS error document, say).
enum Failure {
    Missing(String),
    Broken(String),
}

pub fn day_dir(cache: &Path, date: Date) -> PathBuf {
    cache.join(date.to_string())
}

/// WMS TIME for `minute` minutes after `date` 00:00Z. Callers offset slot times by +-30 min, so the
/// minute may fall in the neighbouring day; naive `h:m` formatting would give hour 24+ or a negative minute.
pub fn wms_time(date: Date, minute: i32) -> String {
    let d = date.plus_days(minute.div_euclid(1440));
    let m = minute.rem_euclid(1440);
    format!("{d}T{:02}:{:02}:00Z", m / 60, m % 60)
}

pub struct Stats {
    pub bytes: AtomicUsize,
    pub requests: AtomicUsize,
    pub cached: AtomicUsize,
    pub missing: AtomicUsize,
    pub broken: AtomicUsize,
}

pub static STATS: Stats = Stats {
    bytes: AtomicUsize::new(0),
    requests: AtomicUsize::new(0),
    cached: AtomicUsize::new(0),
    missing: AtomicUsize::new(0),
    broken: AtomicUsize::new(0),
};

/// Log one skipped input and count it.
fn skip(what: &Path, f: Failure) {
    let (n, why) = match &f {
        Failure::Missing(w) => (&STATS.missing, w),
        Failure::Broken(w) => (&STATS.broken, w),
    };
    n.fetch_add(1, Ordering::Relaxed);
    eprintln!("warning: skipped {}: {why}", what.display());
}

pub fn stats_line() -> String {
    format!(
        "{} requests, {:.1} MB, {} cached, {} missing, {} broken",
        STATS.requests.load(Ordering::Relaxed),
        STATS.bytes.load(Ordering::Relaxed) as f64 / 1e6,
        STATS.cached.load(Ordering::Relaxed),
        STATS.missing.load(Ordering::Relaxed),
        STATS.broken.load(Ordering::Relaxed)
    )
}

fn cached(path: &Path) -> bool {
    std::fs::metadata(path)
        .map(|m| m.len() > 0)
        .unwrap_or(false)
}

/// Write `<path>.part`, then rename: a cache hit is only ever a complete file.
pub fn write_atomic(path: &Path, bytes: &[u8]) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    let part = PathBuf::from(format!("{}.part", path.display()));
    std::fs::write(&part, bytes).unwrap();
    std::fs::rename(&part, path).unwrap();
}

/// GET with 5 tries; the body must start with `magic`. A server Warning header lands in `<path>.warn`.
/// Nothing is written unless the body is the right kind of image.
fn get(url: &str, path: &Path, magic: &[u8]) {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(300)))
        .build()
        .into();
    let mut last = Failure::Missing(String::new());
    for k in 0..5u64 {
        let res = agent
            .get(url)
            .call()
            .map_err(|e| Failure::Missing(e.to_string()))
            .and_then(|mut r| {
                let warn = r
                    .headers()
                    .get("warning")
                    .and_then(|v| v.to_str().ok())
                    .map(str::to_owned);
                let body = r
                    .body_mut()
                    .with_config()
                    .limit(1 << 30)
                    .read_to_vec()
                    .map_err(|e| Failure::Missing(e.to_string()))?;
                if !body.starts_with(magic) {
                    return Err(Failure::Broken(format!(
                        "unexpected body: {:?}",
                        String::from_utf8_lossy(&body[..body.len().min(200)])
                    )));
                }
                Ok((body, warn))
            });
        match res {
            Ok((body, warn)) => {
                write_atomic(path, &body);
                if let Some(w) = warn {
                    std::fs::write(format!("{}.warn", path.display()), w).unwrap();
                }
                STATS.bytes.fetch_add(body.len(), Ordering::Relaxed);
                STATS.requests.fetch_add(1, Ordering::Relaxed);
                return;
            }
            Err(e) => {
                last = e;
                if k < 4 {
                    eprintln!("   retry {}", path.display());
                    std::thread::sleep(std::time::Duration::from_secs(2 + 3 * k));
                }
            }
        }
    }
    skip(path, last)
}

/// Fetch every job not already cached, on `n` threads. Offline, a job is a cache miss and so missing data.
fn fetch_all(jobs: Vec<(PathBuf, String)>, n: usize, magic: &[u8], allow: bool) {
    let (hit, jobs): (Vec<_>, Vec<_>) = jobs.into_iter().partition(|(p, _)| cached(p));
    STATS.cached.fetch_add(hit.len(), Ordering::Relaxed);
    if allow {
        pool(jobs, n, |(p, u)| {
            get(&u, &p, magic);
        });
    } else {
        for (p, _) in jobs {
            skip(&p, Failure::Missing("not cached (--offline)".into()));
        }
    }
}

/// Run jobs on n threads.
fn pool<T: Send>(jobs: Vec<T>, n: usize, f: impl Fn(T) + Sync) {
    let q = Mutex::new(jobs);
    std::thread::scope(|s| {
        for _ in 0..n {
            s.spawn(|| loop {
                let job = q.lock().unwrap().pop();
                match job {
                    Some(j) => f(j),
                    None => break,
                }
            });
        }
    });
}

// ---------- geostationary IR frames (geofetch.py) ----------

#[derive(Clone)]
pub struct FrameReq {
    pub sat: &'static str,
    pub date: Date,
    pub tmin: i32,
    pub x0: usize, // may run past W: wraps
    pub x1: usize,
    pub y0: usize,
    pub y1: usize,
    pub scale: usize,
}

/// WMS BBOX parameter (lon0,lat0,lon1,lat1) of the full-grid pixel box [x0, x1) x [y0, y1).
fn bbox(x0: usize, x1: usize, y0: usize, y1: usize) -> String {
    let (lon0, lon1) = (
        -180.0 + x0 as f64 * 360.0 / W as f64,
        -180.0 + x1 as f64 * 360.0 / W as f64,
    );
    let (lat1, lat0) = (
        90.0 - y0 as f64 * 180.0 / H as f64,
        90.0 - y1 as f64 * 180.0 / H as f64,
    );
    format!("BBOX={lon0:?},{lat0:?},{lon1:?},{lat1:?}")
}

/// (cache path, url) per date-line piece of a request.
fn pieces(frames: &Path, r: &FrameReq) -> Vec<(usize, usize, PathBuf, String)> {
    let mut out = Vec::new();
    let mut a = r.x0;
    while a < r.x1 {
        let b = r.x1.min((a / W + 1) * W);
        let (c0, c1) = (a % W, (b - 1) % W + 1);
        let sfx = if r.scale > 1 {
            format!("_s{}", r.scale)
        } else {
            String::new()
        };
        let path = frames.join(format!(
            "{}_{:04}_{c0}_{c1}_{}_{}{sfx}.png",
            r.sat, r.tmin, r.y0, r.y1
        ));
        let url = format!(
            "{}&{}&WIDTH={}&HEIGHT={}&TIME={}",
            layer_url(by_id(r.sat)),
            bbox(c0, c1, r.y0, r.y1),
            (c1 - c0) / r.scale,
            (r.y1 - r.y0) / r.scale,
            wms_time(r.date, r.tmin)
        );
        out.push((a, b, path, url));
        a = b;
    }
    out
}

/// Fetch every missing piece: 6 GIBS and 4 EUMETView connections.
pub fn prefetch(frames: &Path, reqs: &[FrameReq], allow: bool) {
    let (mut g, mut e) = (Vec::new(), Vec::new());
    for r in reqs {
        for (_, _, path, url) in pieces(frames, r) {
            match by_id(r.sat).host {
                Host::Eumetsat => e.push((path, url)),
                Host::Gibs => g.push((path, url)),
            }
        }
    }
    g.sort();
    g.dedup();
    e.sort();
    e.dedup();
    std::thread::scope(|s| {
        s.spawn(|| fetch_all(g, 6, PNG, allow));
        s.spawn(|| fetch_all(e, 4, PNG, allow));
    });
}

/// The RGBA frame of a request, assembled from its cached pieces; None when a piece is missing (already
/// counted by `prefetch`) or the frame is all black (counted here).
pub fn frame(frames: &Path, r: &FrameReq) -> Option<Rgba> {
    let (oh, ow) = ((r.y1 - r.y0) / r.scale, (r.x1 - r.x0) / r.scale);
    let mut px = vec![0u8; oh * ow * 4];
    for (a, b, path, _) in pieces(frames, r) {
        if !cached(&path) {
            return None;
        }
        let im = rgba(&path);
        let off = (a - r.x0) / r.scale;
        let pw = (b - a) / r.scale;
        assert_eq!((im.w, im.h), (pw, oh), "{}", path.display());
        for y in 0..oh {
            px[(y * ow + off) * 4..(y * ow + off + pw) * 4]
                .copy_from_slice(&im.px[y * pw * 4..(y + 1) * pw * 4]);
        }
    }
    if is_blank(&px) {
        let name = format!("{} {} {}..{}", r.sat, r.tmin, r.x0, r.x1);
        skip(Path::new(&name), Failure::Broken("blank frame".into()));
        return None;
    }
    Some(Rgba { w: ow, h: oh, px })
}

/// Minutes from the planned time tried, in order, when a frame is missing, blank or unusable. Geo IR
/// products are 10-minute: Himawari's 02:40Z slot is a housekeeping gap, GOES-East has blank afternoons.
const RETRY_MINUTES: [i32; 7] = [0, -10, 10, -20, 20, -30, 30];

/// `usable` of the first frame set of `reqs`, all shifted together through RETRY_MINUTES, that is
/// complete and accepted. The planned time must already be prefetched; neighbours are fetched on demand.
pub fn first_usable<T>(
    frames: &Path,
    reqs: &[FrameReq],
    allow: bool,
    usable: impl Fn(Vec<Rgba>) -> Option<T>,
) -> Option<T> {
    RETRY_MINUTES.iter().find_map(|&dt| {
        let rs: Vec<FrameReq> = reqs
            .iter()
            .map(|r| FrameReq {
                tmin: r.tmin + dt,
                ..r.clone()
            })
            .collect();
        if dt != 0 {
            prefetch(frames, &rs, allow);
        }
        let fs: Option<Vec<Rgba>> = rs.iter().map(|r| frame(frames, r)).collect();
        fs.and_then(&usable)
    })
}

// ---------- NOAA-20 granules (fetch_granules.py) and the daily mosaics ----------

fn slots() -> Vec<String> {
    (0..24)
        .flat_map(|h| (0..60).step_by(6).map(move |m| format!("{h:02}{m:02}")))
        .collect()
}

/// UTC minute of a granule slot named `HHMM`.
pub fn slot_minute(s: &str) -> i32 {
    s[..2].parse::<i32>().unwrap() * 60 + s[2..].parse::<i32>().unwrap()
}

/// WMS time of a granule slot named `HHMM`.
fn tstr(date: Date, s: &str) -> String {
    wms_time(date, slot_minute(s))
}

/// One granule slot's `hi` pieces: (slot `HHMM`, [(png path, x0, y0)]), daylit slots only.
pub type SlotPieces = Vec<(String, Vec<(PathBuf, usize, usize)>)>;

/// fetch_granules.py `lo` then `hi`: footprints at 1024x512, then each daylit slot's bbox at full res.
/// Returns the non-empty footprints, which the orbit fit reads, and where each slot's pieces sit.
pub fn granules(dir: &Path, date: Date, allow: bool) -> (Footprints, SlotPieces) {
    let granule = layer_url(by_id("viirs_n20_granule"));
    let lo = dir.join("lo");
    let jobs: Vec<(PathBuf, String)> = slots()
        .iter()
        .map(|s| {
            (
                lo.join(format!("{s}.png")),
                format!(
                    "{granule}&BBOX=-180,-90,180,90&WIDTH=1024&HEIGHT=512&TIME={}",
                    tstr(date, s)
                ),
            )
        })
        .collect();
    fetch_all(jobs, 6, PNG, allow);
    let hi = dir.join("hi");
    let mut footprints = Footprints::new();
    let mut pieces = SlotPieces::new();
    let mut jobs = Vec::new();
    for s in slots() {
        let path = lo.join(format!("{s}.png"));
        if !cached(&path) {
            continue;
        }
        let im = rgba(&path);
        let m: Vec<bool> = im.px.chunks(4).map(|c| c[3] > 0).collect();
        if !m.iter().any(|&b| b) {
            continue;
        }
        assert_eq!((im.w, im.h), (FOOT_W, FOOT_H), "{s}");
        let ys: Vec<usize> = (0..im.h)
            .filter(|&y| m[y * im.w..(y + 1) * im.w].iter().any(|&b| b))
            .collect();
        let occ: Vec<bool> = (0..im.w)
            .map(|x| (0..im.h).any(|y| m[y * im.w + x]))
            .collect();
        let y0 = ys[0].saturating_sub(2) * 8;
        let y1 = (ys[ys.len() - 1] + 3).min(512) * 8;
        let mut list = Vec::new();
        for (k, (c0, ln)) in col_runs(&occ).into_iter().enumerate() {
            let (c0, ln) = (c0 as i64 - 2, (ln + 4).min(1024) as i64);
            let ps: Vec<(i64, i64)> = if ln == 1024 {
                vec![(0, 1024)]
            } else if c0 >= 0 && c0 + ln <= 1024 {
                vec![(c0, ln)]
            } else {
                let a = c0.rem_euclid(1024);
                vec![(a, 1024 - a), (0, (c0 + ln).rem_euclid(1024))]
            };
            for (p, (a, l)) in ps.into_iter().enumerate() {
                let (x0, x1) = (a as usize * 8, (a + l) as usize * 8);
                let path = hi.join(format!("{s}_{k}{p}.png"));
                list.push((path.clone(), x0, y0));
                let url = format!(
                    "{granule}&{}&WIDTH={}&HEIGHT={}&TIME={}",
                    bbox(x0, x1, y0, y1),
                    x1 - x0,
                    y1 - y0,
                    tstr(date, &s)
                );
                jobs.push((path, url));
            }
        }
        pieces.push((s.clone(), list));
        footprints.push(Footprint {
            minute: slot_minute(&s) as f64,
            mask: m,
        });
    }
    fetch_all(jobs, 6, PNG, allow);
    (footprints, pieces)
}

/// Occupied column runs of a 1024-wide footprint, merged across the date line: (start, length).
fn col_runs(occ: &[bool]) -> Vec<(usize, usize)> {
    let n = occ.len();
    if occ.iter().all(|&b| b) {
        return vec![(0, n)];
    }
    let g = occ.iter().position(|&b| !b).unwrap();
    let r: Vec<bool> = (0..n).map(|i| occ[(i + g) % n]).collect();
    let (mut runs, mut i) = (Vec::new(), 0);
    while i < n {
        if r[i] {
            let j = (i..n).find(|&j| !r[j]).unwrap_or(n);
            runs.push(((i + g) % n, j - i));
            i = j;
        } else {
            i += 1;
        }
    }
    runs
}

/// The GIBS daily true-colour mosaics, whole globe at 8192x4096 JPEG. Err names the first required
/// mosaic that could not be had.
pub fn mosaics(dir: &Path, date: Date, allow: bool) -> Result<(), String> {
    let jobs: Vec<(PathBuf, String)> = crate::sources_table::mosaics()
        .map(|s| {
            (
                dir.join(format!("{}.jpg", s.id)),
                format!(
                    "{}&BBOX=-180,-90,180,90&WIDTH=8192&HEIGHT=4096&TIME={date}",
                    layer_url(s)
                ),
            )
        })
        .collect();
    fetch_all(jobs, 2, JPEG, allow);
    match crate::sources_table::mosaics()
        .find(|s| s.required && !cached(&dir.join(format!("{}.jpg", s.id))))
    {
        Some(s) => Err(format!("required source {} is missing or broken", s.id)),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> Date {
        Date::parse(s).unwrap()
    }

    /// Caches `r`'s frame as one uniform piece of RGBA `c`.
    fn cache_frame(dir: &Path, r: &FrameReq, c: [u8; 4]) {
        let (w, h) = (
            ((r.x1 - r.x0) / r.scale) as u32,
            ((r.y1 - r.y0) / r.scale) as u32,
        );
        let (_, _, path, _) = &pieces(dir, r)[0];
        std::fs::create_dir_all(dir).unwrap();
        image::RgbaImage::from_pixel(w, h, image::Rgba(c))
            .save(path)
            .unwrap();
    }

    #[test]
    fn a_blank_frame_is_retried_at_the_nearest_time_with_an_image() {
        let dir = std::env::temp_dir().join(format!("cloud-bake-near-{}", std::process::id()));
        let at = |tmin| FrameReq {
            sat: "goes_e",
            date: d("2026-10-28"),
            tmin,
            x0: 2400,
            x1: 2416,
            y0: 1000,
            y1: 1008,
            scale: 4,
        };
        cache_frame(&dir, &at(720), [0, 0, 0, 0]);
        cache_frame(&dir, &at(710), [0, 0, 0, 255]);
        cache_frame(&dir, &at(730), [90, 90, 90, 255]);
        cache_frame(&dir, &at(700), [200, 200, 200, 255]);
        let got = first_usable(&dir, &[at(720)], false, |f| Some(f[0].px[0]));
        std::fs::remove_dir_all(&dir).unwrap();
        assert_eq!(got, Some(90));
    }

    #[test]
    fn wms_time_rolls_minus_30_into_the_previous_day() {
        assert_eq!(wms_time(d("2026-11-01"), -30), "2026-10-31T23:30:00Z");
    }

    #[test]
    fn wms_time_rolls_1450_into_the_next_day() {
        assert_eq!(wms_time(d("2026-12-31"), 1450), "2027-01-01T00:10:00Z");
    }

    #[test]
    fn wms_time_keeps_0_and_1439_on_the_day() {
        assert_eq!(wms_time(d("2026-11-09"), 0), "2026-11-09T00:00:00Z");
        assert_eq!(wms_time(d("2026-11-09"), 1439), "2026-11-09T23:59:00Z");
    }
}
