//! Circular sun-synchronous orbit model for NOAA-20 / NOAA-21 (orbit.py): one fitted ascending node
//! (time, longitude) fixes every pass of the day, and NOAA-21's node sits a measured offset from it. The
//! node drifts day to day, so `fit` recovers it from that day's NOAA-20 granule footprints.
use rayon::prelude::*;
use std::f64::consts::{PI, TAU};

pub const P: f64 = 101.44; // nodal period, min
pub const HALF_SWATH: f64 = 1520.0 / 6371.0; // VIIRS half swath, radians of arc
const INC_DEG: f64 = 98.74;
/// NOAA-21's ascending node relative to NOAA-20's: (minutes later, degrees of longitude east). The two
/// keep station by manoeuvre, so this is a measurement that can go stale: SGP4 on CelesTrak TLEs for
/// 2026-11-06 and -09 gives 43.9 min and -12.8 deg, GIBS OrbitTracks labels 43.9 and -12.7. A pure time
/// shift would give -11.0 deg; NOAA-21 crosses the equator ~7 min earlier in local time.
pub const N21_AFTER_N20: (f64, f64) = (43.9, -12.8);

/// Width and height of a low-res granule footprint (`granules/lo/<HHMM>.png`).
pub const FOOT_W: usize = 1024;
pub const FOOT_H: usize = 512;
const SAMPLES_PER_SLOT: usize = 150;
// A full day gives ~7,000-10,000 samples; under four slots' worth the granules are essentially
// missing and any fit would be noise.
const MIN_FIT_SAMPLES: usize = 600;
// Median |pass time - sample time| of a good fit; the slot binning alone puts a floor under it. Measured
// 2026-11-06 and 2026-11-09: 2.0 min. Above 5 the orbit model no longer explains the footprints.
const MAX_MEDIAN_DT_MIN: f64 = 5.0;

/// One granule slot: its start minute (UTC) and its swath mask (alpha > 0), FOOT_W x FOOT_H.
pub struct Footprint {
    pub minute: f64,
    pub mask: Vec<bool>,
}
pub type Footprints = Vec<Footprint>;

pub struct OrbitFit {
    pub orbit: Orbit,
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
    /// This orbit's node moved `dt` minutes later and `dlon` degrees east.
    pub fn shifted(&self, (dt, dlon): (f64, f64)) -> Orbit {
        Orbit {
            tn: self.tn + dt,
            lon_n: self.lon_n + dlon,
        }
    }

    /// Sub-satellite (lat, lon) at UTC minute t, and whether the pass is ascending.
    fn track(&self, t: f64) -> (f64, f64, bool) {
        let inc = INC_DEG.to_radians();
        let u = 2.0 * std::f64::consts::PI * (t - self.tn) / P;
        let lat = (inc.sin() * u.sin()).asin().to_degrees();
        let lon = self.lon_n + (inc.cos() * u.sin()).atan2(u.cos()).to_degrees()
            - 360.0 * (t - self.tn) / 1440.0;
        (lat, (lon + 180.0).rem_euclid(360.0) - 180.0, u.cos() > 0.0)
    }

    /// Ascending track samples (UTC minute, unit vector) at numpy-arange times in [t0, t1).
    fn ascending(&self, t0: f64, t1: f64, step: f64) -> Vec<(f64, [f64; 3])> {
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
                let (la, lo, asc) = self.track(t);
                asc.then(|| (t, xyz(la, lo)))
            })
            .collect()
    }

    /// For each (lat, lon): UTC minute of the nearest-nadir ascending sample in [t0, t1) and its
    /// cross-track angle (radians); NaN time when the window holds no ascending sample.
    pub fn pass_time(&self, pts: &[(f64, f64)], t0: f64, t1: f64, step: f64) -> Vec<(f64, f64)> {
        let samples = self.ascending(t0, t1, step);
        // Exact nearest neighbour without scanning every sample (the fit calls this ~200 times): walk
        // out in longitude from the point and stop where even the distance to a sample's meridian
        // half-plane, r sin(dlon) with r the point's distance from the axis, beats the best. The
        // samples are tiled three times around the circle so the walk never wraps, between infinite-
        // longitude sentinels that end it without a bounds check. Ties go to the earlier sample.
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

/// Up to `per_slot` swath pixels per slot within +-30 deg latitude, strided so the sample set never
/// depends on thread count; time = slot start + 3 min (mid-granule).
fn samples(footprints: &Footprints, per_slot: usize) -> (Vec<(f64, f64)>, Vec<f64>) {
    let (mut pts, mut ts) = (Vec::new(), Vec::new());
    for f in footprints {
        let hit: Vec<(usize, usize)> = (0..FOOT_H)
            .filter(|&y| lat_of(y).abs() < 30.0)
            .flat_map(|y| (0..FOOT_W).map(move |x| (y, x)))
            .filter(|&(y, x)| f.mask[y * FOOT_W + x])
            .collect();
        let k = hit.len().min(per_slot);
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

fn median(mut v: Vec<f64>) -> f64 {
    v.sort_by(f64::total_cmp);
    let n = v.len();
    (v[(n - 1) / 2] + v[n / 2]) / 2.0 // numpy median: mean of the middle pair
}

fn argmin(v: &[f64]) -> usize {
    (0..v.len()).fold(0, |b, i| if v[i] < v[b] { i } else { b })
}

/// Median |pass time - sample time| for the orbit with node time `tn` and local time `ltan` (h).
fn misfit(pts: &[(f64, f64)], ts: &[f64], ltan: f64, tn: f64) -> f64 {
    let o = Orbit {
        tn,
        lon_n: 15.0 * (ltan - tn / 60.0),
    };
    let pass = o.pass_time(pts, 0.0, 1440.0, 0.5);
    median(
        pass.iter()
            .zip(ts)
            .map(|(&(tt, _), &t)| (tt - t).abs())
            .collect(),
    )
}

/// Median signed angle (radians) of the samples from the orbit plane each was imaged in. Seen from the
/// Earth, that plane's node sits at 15 ltan - t/4 deg at minute t whatever the node time, so this
/// measures LTAN alone; a VIIRS scan line straddles the plane, so the right LTAN zeroes it.
fn plane_offset(ps: &[[f64; 3]], ts: &[f64], ltan: f64) -> f64 {
    let (si, ci) = INC_DEG.to_radians().sin_cos();
    let off = ps.iter().zip(ts).map(|(p, &t)| {
        let (so, co) = (15.0 * ltan - t / 4.0).to_radians().sin_cos();
        (si * so * p[0] - si * co * p[1] + ci * p[2]).asin()
    });
    median(off.collect())
}

/// LTAN 13.0..=14.0 h at 0.005 h from the swath geometry, then node time [0, P) at 0.5 min from the
/// slot times. Times alone barely move when the tracks shift sideways: they left LTAN loose by ~0.4 h
/// (6 deg of track longitude) on 2026-11-06. Err when the footprints are too few or the best orbit
/// still misses their times by more than MAX_MEDIAN_DT_MIN.
pub fn fit(footprints: &Footprints) -> Result<OrbitFit, String> {
    let (pts, ts) = samples(footprints, SAMPLES_PER_SLOT);
    if pts.len() < MIN_FIT_SAMPLES {
        return Err(format!(
            "orbit unfit: {} footprint samples within +-30 deg, need {MIN_FIT_SAMPLES}",
            pts.len()
        ));
    }
    // Every pixel: the stride above leans to one side of the swath, 0.3 deg on a synthetic day.
    let (all, all_ts) = samples(footprints, usize::MAX);
    let ps: Vec<[f64; 3]> = all.iter().map(|&(la, lo)| xyz(la, lo)).collect();
    let ltans: Vec<f64> = (0..=200).map(|i| 13.0 + i as f64 * 0.005).collect();
    let off: Vec<f64> = ltans
        .par_iter()
        .map(|&l| plane_offset(&ps, &all_ts, l).abs())
        .collect();
    let ltan = ltans[argmin(&off)];
    let tns: Vec<f64> = (0..(P / 0.5).ceil() as usize)
        .map(|j| j as f64 * 0.5)
        .collect();
    let errs: Vec<f64> = tns
        .par_iter()
        .map(|&tn| misfit(&pts, &ts, ltan, tn))
        .collect();
    let (tn, err) = (tns[argmin(&errs)], errs[argmin(&errs)]);
    if err > MAX_MEDIAN_DT_MIN {
        return Err(format!(
            "orbit unfit: median |dt| {err:.2} min, limit {MAX_MEDIAN_DT_MIN}"
        ));
    }
    Ok(OrbitFit {
        orbit: Orbit {
            tn,
            lon_n: 15.0 * (ltan - tn / 60.0),
        },
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
        for (t0, t1) in [
            (0.0, 1440.0),
            (300.0, 420.0),
            (700.0, 712.0),
            (740.0, 760.0),
        ] {
            let samples = orb.ascending(t0, t1, 0.1);
            let got = orb.pass_time(&pts, t0, t1, 0.1);
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
    fn fit_puts_the_ground_tracks_on_the_swath_centres() {
        // NOAA-20 on 2026-11-06 (CelesTrak TLE + GIBS track labels). Slot-binned times alone fit this day
        // 0.19 h of LTAN off, 2.9 deg of ground-track longitude; 0.3 deg needs the swath geometry.
        let truth = Orbit {
            tn: 44.0,
            lon_n: 15.0 * (13.54 - 44.0 / 60.0),
        };
        let px: Vec<(f64, f64)> = (0..FOOT_H)
            .flat_map(|y| (0..FOOT_W).map(move |x| (y, x)))
            .map(|(y, x)| (lat_of(y), -180.0 + (x as f64 + 0.5) * 360.0 / FOOT_W as f64))
            .collect();
        let pass = truth.pass_time(&px, 0.0, 1440.0, 0.1);
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
        assert!((f.ltan - 13.54).abs() * 15.0 <= 0.3, "ltan {}", f.ltan);
        // Times binned into 6-min slots leave median |dt| flat over tn +-1.5 min; the grid takes the first.
        assert!((f.orbit.tn - 44.0).abs() <= 1.5, "tn {}", f.orbit.tn);
        assert!(f.median_dt_min <= 3.0, "median {}", f.median_dt_min);
    }

    #[test]
    fn noaa21_passes_over_45n_when_and_where_sgp4_puts_it_on_2026_11_06() {
        // SGP4 on CelesTrak TLEs: NOAA-20's day fits (43.91 min, 192.07 deg); NOAA-21 crossed 45 N at
        // these (UTC minute, lon).
        let n21 = Orbit {
            tn: 43.91,
            lon_n: 192.07,
        }
        .shifted(N21_AFTER_N20);
        for (t, lon) in [(810.8, -10.3), (912.3, -35.6), (1013.8, -61.0)] {
            let (tt, a) = n21.pass_time(&[(45.0, lon)], t - 30.0, t + 30.0, 0.01)[0];
            assert!(
                (tt - t).abs() < 0.5 && a.to_degrees() < 0.5,
                "{t}: {tt} {a}"
            );
        }
    }

    #[test]
    fn fit_refuses_a_day_without_footprints() {
        assert!(fit(&Footprints::new()).is_err());
    }
}
