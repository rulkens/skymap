//! Circular sun-synchronous orbit model for NOAA-20 / NOAA-21 (orbit.py): one fitted ascending node
//! (time, longitude) fixes every pass of the day; NOAA-21 flies half an orbit behind. The node drifts
//! day to day, so `fit` recovers it from that day's granule footprints (fit_orbit.py).
use rayon::prelude::*;
use std::f64::consts::{PI, TAU};

pub const P: f64 = 101.44; // nodal period, min
pub const HALF_SWATH: f64 = 1520.0 / 6371.0; // VIIRS half swath, radians of arc
const INC_DEG: f64 = 98.74;

/// Width and height of a low-res granule footprint (`granules/lo/<HHMM>.png`).
pub const FOOT_W: usize = 1024;
pub const FOOT_H: usize = 512;
const SAMPLES_PER_SLOT: usize = 150;
// A full day gives ~7,000-10,000 samples; under four slots' worth the granules are essentially
// missing and any fit would be noise.
const MIN_FIT_SAMPLES: usize = 600;

/// One granule slot: its start minute (UTC) and its swath mask (alpha > 0), FOOT_W x FOOT_H.
pub struct Footprint {
    pub minute: f64,
    pub mask: Vec<bool>,
}
pub type Footprints = Vec<Footprint>;

pub struct OrbitFit {
    pub tn: f64,
    pub lon_n: f64,
    pub ltan: f64,
    pub median_dt_min: f64,
}

#[derive(Clone, Copy)]
pub struct Orbit {
    pub tn: f64,
    pub lon_n: f64,
}

fn xyz(lat: f64, lon: f64) -> [f64; 3] {
    let (la, lo) = (lat.to_radians(), lon.to_radians());
    [la.cos() * lo.cos(), la.cos() * lo.sin(), la.sin()]
}

impl Orbit {
    /// Sub-satellite (lat, lon) at UTC minute t, and whether the pass is ascending.
    fn track(&self, t: f64, phase: f64) -> (f64, f64, bool) {
        let inc = INC_DEG.to_radians();
        let u = 2.0 * std::f64::consts::PI * ((t - self.tn) / P + phase);
        let lat = (inc.sin() * u.sin()).asin().to_degrees();
        let lon = self.lon_n + (inc.cos() * u.sin()).atan2(u.cos()).to_degrees()
            - 360.0 * (t - self.tn) / 1440.0;
        (lat, (lon + 180.0).rem_euclid(360.0) - 180.0, u.cos() > 0.0)
    }

    /// Ascending track samples (UTC minute, unit vector) at numpy-arange times in [t0, t1).
    fn ascending(&self, phase: f64, t0: f64, t1: f64, step: f64) -> Vec<(f64, [f64; 3])> {
        let n = ((t1 - t0) / step).ceil().max(0.0) as usize;
        // numpy arange fills start + i * ((start + step) - start), not start + i * step: candidate times land
        // on 10-min slot boundaries (215.0 -> slot 220), so the last ulp decides which frame is fetched
        let delta = (t0 + step) - t0;
        (0..n)
            .map(|i| {
                if i == 1 {
                    t0 + step
                } else {
                    t0 + i as f64 * delta
                }
            })
            .filter_map(|t| {
                let (la, lo, asc) = self.track(t, phase);
                asc.then(|| (t, xyz(la, lo)))
            })
            .collect()
    }

    /// For each (lat, lon): UTC minute of the nearest-nadir ascending sample in [t0, t1) and its
    /// cross-track angle (radians); NaN time when the window holds no ascending sample.
    pub fn pass_time(
        &self,
        pts: &[(f64, f64)],
        phase: f64,
        t0: f64,
        t1: f64,
        step: f64,
    ) -> Vec<(f64, f64)> {
        let samples = self.ascending(phase, t0, t1, step);
        // Exact nearest neighbour without scanning every sample (the fit calls this ~4400 times): walk
        // out in longitude from the point and stop where even the distance to a sample's meridian
        // half-plane, r sin(dlon) with r the point's distance from the axis, beats the best. The
        // samples are tiled three times around the circle so the walk never wraps, between infinite-
        // longitude sentinels that end it without a bounds check (which doubled the fit's time).
        // Ties go to the earlier sample, as in the time-ordered brute force this replaced.
        let n = samples.len();
        if n == 0 {
            return vec![(f64::NAN, PI); pts.len()];
        }
        let mut lon_sorted: Vec<(f64, f64, [f64; 3])> = samples
            .iter()
            .map(|&(t, s)| (s[1].atan2(s[0]), t, s))
            .collect();
        lon_sorted.sort_by(|a, b| a.0.total_cmp(&b.0));
        let end = |l: f64| (l, f64::NAN, [0.0; 3]);
        let ring: Vec<(f64, f64, [f64; 3])> = std::iter::once(end(-f64::INFINITY))
            .chain(
                [-TAU, 0.0, TAU]
                    .iter()
                    .flat_map(|&k| lon_sorted.iter().map(move |&(l, t, s)| (l + k, t, s))),
            )
            .chain(std::iter::once(end(f64::INFINITY)))
            .collect();
        pts.par_iter()
            .map(|&(la, lo)| {
                let p = xyz(la, lo);
                let (r2, pl) = (p[0] * p[0] + p[1] * p[1], p[1].atan2(p[0]));
                let (mut best, mut bt, mut reach) = (f64::INFINITY, f64::NAN, PI);
                let mid = 1 + n + ring[1 + n..1 + 2 * n].partition_point(|s| s.0 < pl);
                let (mut r, mut l) = (mid, mid);
                loop {
                    let (dr, dl) = (ring[r].0 - pl, pl - ring[l - 1].0);
                    let (go_r, go_l) = (dr < PI && dr <= reach, dl <= PI && dl <= reach);
                    let i = match (go_r, go_l) {
                        (true, true) if dr <= dl => r,
                        (true, false) => r,
                        (_, true) => l - 1,
                        _ => break,
                    };
                    if i == r {
                        r += 1;
                    } else {
                        l -= 1;
                    }
                    let (_, t, s) = ring[i];
                    let d = (p[0] - s[0]).powi(2) + (p[1] - s[1]).powi(2) + (p[2] - s[2]).powi(2);
                    if d < best || (d == best && t < bt) {
                        best = d;
                        bt = t;
                        if best < r2 {
                            reach = (best / r2).sqrt().asin() * (1.0 + 1e-9) + 1e-12;
                        }
                    }
                }
                (bt, 2.0 * (best.sqrt() / 2.0).clamp(0.0, 1.0).asin())
            })
            .collect()
    }
}

/// Up to SAMPLES_PER_SLOT swath pixels per slot within +-30 deg latitude, strided so the sample set
/// never depends on thread count; time = slot start + 3 min (mid-granule).
fn samples(footprints: &Footprints) -> (Vec<(f64, f64)>, Vec<f64>) {
    let (mut pts, mut ts) = (Vec::new(), Vec::new());
    for f in footprints {
        let hit: Vec<(usize, usize)> = (0..FOOT_H)
            .filter(|&y| lat_of(y).abs() < 30.0)
            .flat_map(|y| (0..FOOT_W).map(move |x| (y, x)))
            .filter(|&(y, x)| f.mask[y * FOOT_W + x])
            .collect();
        let k = hit.len().min(SAMPLES_PER_SLOT);
        for i in 0..k {
            let (y, x) = hit[i * hit.len() / k];
            pts.push((lat_of(y), -180.0 + (x as f64 + 0.5) * 360.0 / FOOT_W as f64));
            ts.push(f.minute + 3.0);
        }
    }
    (pts, ts)
}

fn lat_of(y: usize) -> f64 {
    90.0 - (y as f64 + 0.5) * 180.0 / FOOT_H as f64
}

/// Median |pass time - sample time| for the orbit with node time `tn` and local time `ltan` (h).
fn misfit(pts: &[(f64, f64)], ts: &[f64], ltan: f64, tn: f64, step: f64) -> f64 {
    let o = Orbit {
        tn,
        lon_n: 15.0 * (ltan - tn / 60.0),
    };
    let mut dt: Vec<f64> = o
        .pass_time(pts, 0.0, 0.0, 1440.0, step)
        .iter()
        .zip(ts)
        .map(|(&(tt, _), &t)| (tt - t).abs())
        .collect();
    dt.sort_by(f64::total_cmp);
    let n = dt.len();
    (dt[(n - 1) / 2] + dt[n / 2]) / 2.0 // numpy median: mean of the middle pair
}

/// Best (ltan, tn) on a grid, first minimum in ltan-major order (as the Python loops find it).
fn best_on(pts: &[(f64, f64)], ts: &[f64], grid: &[(f64, f64)], step: f64) -> (f64, f64, f64) {
    let errs: Vec<f64> = grid
        .par_iter()
        .map(|&(l, n)| misfit(pts, ts, l, n, step))
        .collect();
    let i = (0..errs.len()).fold(0, |b, i| if errs[i] < errs[b] { i } else { b });
    (errs[i], grid[i].0, grid[i].1)
}

fn grid(l0: f64, ln: usize, ls: f64, n0: f64, nn: usize, ns: f64) -> Vec<(f64, f64)> {
    (0..ln)
        .flat_map(|i| (0..nn).map(move |j| (l0 + i as f64 * ls, n0 + j as f64 * ns)))
        .collect()
}

/// Coarse grid LTAN 13.0..=14.0 h x node time [0, P) at 0.5 min, then a fine pass around the best.
pub fn fit(footprints: &Footprints) -> Result<OrbitFit, String> {
    let (pts, ts) = samples(footprints);
    if pts.len() < MIN_FIT_SAMPLES {
        return Err(format!(
            "orbit unfit: {} footprint samples within +-30 deg, need {MIN_FIT_SAMPLES}",
            pts.len()
        ));
    }
    let coarse = grid(13.0, 21, 0.05, 0.0, (P / 0.5).ceil() as usize, 0.5);
    let (e0, l0, n0) = best_on(&pts, &ts, &coarse, 0.5);
    let fine = grid(l0 - 0.05, 11, 0.01, n0 - 0.5, 11, 0.1);
    let (e1, l1, n1) = best_on(&pts, &ts, &fine, 0.1);
    // the fine pass only replaces the coarse best when strictly better, as in fit_orbit.py
    let (err, ltan, tn) = if e1 < e0 { (e1, l1, n1) } else { (e0, l0, n0) };
    Ok(OrbitFit {
        tn,
        lon_n: 15.0 * (ltan - tn / 60.0),
        ltan,
        median_dt_min: err,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pass_time_matches_a_brute_force_scan() {
        let orb = Orbit {
            tn: 37.3,
            lon_n: -61.0,
        };
        let pts: Vec<(f64, f64)> = (0..=36)
            .flat_map(|i| (0..=36).map(move |j| (-90.0 + i as f64 * 5.0, -180.0 + j as f64 * 10.0)))
            .collect();
        for (phase, t0, t1) in [
            (0.0, 0.0, 1440.0),
            (0.5, 300.0, 420.0),
            (0.0, 700.0, 712.0),
            (0.0, 740.0, 760.0),
        ] {
            let samples = orb.ascending(phase, t0, t1, 0.1);
            let got = orb.pass_time(&pts, phase, t0, t1, 0.1);
            for (&(la, lo), &(t, _)) in pts.iter().zip(&got) {
                let p = xyz(la, lo);
                let d = |s: &[f64; 3]| (0..3).map(|k| (p[k] - s[k]).powi(2)).sum::<f64>();
                let want = samples.iter().fold((f64::INFINITY, f64::NAN), |b, (t, s)| {
                    if d(s) < b.0 {
                        (d(s), *t)
                    } else {
                        b
                    }
                });
                assert_eq!(
                    t.to_bits(),
                    want.1.to_bits(),
                    "({la}, {lo}) in [{t0}, {t1})"
                );
            }
        }
    }

    #[test]
    fn fit_recovers_a_known_orbit_from_synthetic_footprints() {
        let truth = Orbit {
            tn: 89.0,
            lon_n: 15.0 * (13.10 - 89.0 / 60.0),
        };
        let px: Vec<(f64, f64)> = (0..FOOT_H)
            .flat_map(|y| (0..FOOT_W).map(move |x| (y, x)))
            .map(|(y, x)| (lat_of(y), -180.0 + (x as f64 + 0.5) * 360.0 / FOOT_W as f64))
            .collect();
        let pass = truth.pass_time(&px, 0.0, 0.0, 1440.0, 0.1);
        let footprints: Footprints = (0..240)
            .map(|k| k as f64 * 6.0)
            .map(|m| Footprint {
                minute: m,
                mask: pass
                    .iter()
                    .map(|&(t, a)| a < HALF_SWATH && t >= m && t < m + 6.0)
                    .collect(),
            })
            .filter(|f| f.mask.iter().any(|&b| b))
            .collect();
        let f = fit(&footprints).unwrap();
        // Slot-binned times leave the median a valley ~1 min x 0.1 h wide (this truth fits to
        // 88.0 min / 13.00 h), so the tolerances are the valley's, not the grid step's.
        assert!((f.tn - 89.0).abs() <= 1.5, "tn {}", f.tn);
        assert!((f.ltan - 13.10).abs() <= 0.15, "ltan {}", f.ltan);
        assert!(f.median_dt_min <= 3.0, "median {}", f.median_dt_min);
    }

    #[test]
    fn fit_refuses_a_day_without_footprints() {
        assert!(fit(&Footprints::new()).is_err());
    }
}
