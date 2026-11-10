//! Circular sun-synchronous orbit model for NOAA-20 / NOAA-21 (orbit.py): one fitted ascending node
//! (time, longitude) fixes every pass of the day; NOAA-21 flies half an orbit behind.
use rayon::prelude::*;

pub const P: f64 = 101.44; // nodal period, min
pub const HALF_SWATH: f64 = 1520.0 / 6371.0; // VIIRS half swath, radians of arc
const INC_DEG: f64 = 98.74;

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

    /// For each (lat, lon): UTC minute of the nearest-nadir ascending sample in [t0, t1) and its
    /// cross-track angle (radians). Brute force over the track samples (cKDTree in the Python).
    pub fn pass_time(
        &self,
        pts: &[(f64, f64)],
        phase: f64,
        t0: f64,
        t1: f64,
        step: f64,
    ) -> Vec<(f64, f64)> {
        let n = ((t1 - t0) / step).ceil().max(0.0) as usize;
        // numpy arange fills start + i * ((start + step) - start), not start + i * step: candidate times land
        // on 10-min slot boundaries (215.0 -> slot 220), so the last ulp decides which frame is fetched
        let delta = (t0 + step) - t0;
        let samples: Vec<(f64, [f64; 3])> = (0..n)
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
            .collect();
        pts.par_iter()
            .map(|&(la, lo)| {
                let p = xyz(la, lo);
                let (mut best, mut bt) = (f64::INFINITY, f64::NAN);
                for (t, s) in &samples {
                    let d = (p[0] - s[0]).powi(2) + (p[1] - s[1]).powi(2) + (p[2] - s[2]).powi(2);
                    if d < best {
                        best = d;
                        bt = *t;
                    }
                }
                (bt, 2.0 * (best.sqrt() / 2.0).clamp(0.0, 1.0).asin())
            })
            .collect()
    }
}
