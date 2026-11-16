//! Calibration probe: the MTG and IODC grey->temperature tables are frozen, so each bake checks them
//! against GOES-East / MTG where two satellites see the same sky at 12:00Z, or the nearest time both
//! frames are usable (`fetch::first_usable`). A stretch change upstream shows up as a median |dT| jump
//! here, before the bake spends minutes on a wrong decode.
use crate::date::Date;
use crate::fetch::{self, FrameReq};
use crate::geodecode::Decoder;
use crate::grid::{H, W};
use std::path::Path;

#[derive(Clone, Copy)]
pub struct Calibration {
    /// Median |dT| in kelvin; NaN when the pair's frames were unavailable (skipped, not drift).
    pub mtg_goes_e_k: f64,
    pub mtg_iodc_k: f64,
}

const NOON: i32 = 720;
const SCALE: usize = 4;
const LAT: (f64, f64) = (-60.0, 60.0);
const ATLANTIC: (f64, f64) = (-75.0, -30.0);
const INDIAN: (f64, f64) = (30.0, 60.0);

fn col(lon: f64) -> usize {
    ((lon + 180.0) / 360.0 * W as f64).round() as usize / SCALE * SCALE
}

fn row(lat: f64) -> usize {
    ((90.0 - lat) / 180.0 * H as f64).round() as usize / SCALE * SCALE
}

fn req(sat: &'static str, date: Date, lon: (f64, f64)) -> FrameReq {
    FrameReq {
        sat,
        date,
        tmin: NOON,
        x0: col(lon.0),
        x1: col(lon.1),
        y0: row(LAT.1),
        y1: row(LAT.0),
        scale: SCALE,
    }
}

/// Median |a - b| over the pixels where both are finite; None when no pixel is valid in both.
pub fn median_abs_diff(a: &[f32], b: &[f32]) -> Option<f64> {
    let mut d: Vec<f64> = a
        .iter()
        .zip(b)
        .filter(|(x, y)| x.is_finite() && y.is_finite())
        .map(|(x, y)| (*x as f64 - *y as f64).abs())
        .collect();
    if d.is_empty() {
        return None;
    }
    d.sort_by(f64::total_cmp);
    Some(if d.len() % 2 == 1 {
        d[d.len() / 2]
    } else {
        (d[d.len() / 2 - 1] + d[d.len() / 2]) / 2.0
    })
}

fn drift(
    pair: (&'static str, &'static str),
    lon: (f64, f64),
    date: Date,
    dir: &Path,
    allow: bool,
    dec: &Decoder,
) -> f64 {
    let reqs = [req(pair.0, date, lon), req(pair.1, date, lon)];
    fetch::prefetch(dir, &reqs, allow);
    let k = fetch::first_usable(dir, &reqs, allow, |f| {
        median_abs_diff(
            &dec.temperature(&reqs[0], &f[0]),
            &dec.temperature(&reqs[1], &f[1]),
        )
    });
    k.unwrap_or_else(|| {
        eprintln!(
            "warning: probe {}/{} skipped, no time with both frames usable",
            pair.0, pair.1
        );
        f64::NAN
    })
}

pub fn probe(date: Date, cache: &Path, offline: bool, dec: &Decoder) -> Calibration {
    let dir = fetch::day_dir(cache, date).join("probe");
    let go = |pair, lon| drift(pair, lon, date, &dir, !offline, dec);
    Calibration {
        mtg_goes_e_k: go(("mtg", "goes_e"), ATLANTIC),
        mtg_iodc_k: go(("mtg", "iodc"), INDIAN),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_drift_is_near_zero_for_identical_decodes_and_10_k_for_a_10_k_offset() {
        let a: Vec<f32> = (0..1000).map(|i| -60.0 + i as f32 * 0.07).collect();
        let mut b: Vec<f32> = a.iter().map(|v| v + 10.0).collect();
        assert_eq!(median_abs_diff(&a, &a), Some(0.0));
        let m = median_abs_diff(&a, &b).unwrap();
        assert!((m - 10.0).abs() < 1e-4, "{m}");
        // NaN pixels are ignored, and no overlap at all is None
        b[0] = f32::NAN;
        assert!((median_abs_diff(&a, &b).unwrap() - 10.0).abs() < 1e-4);
        assert_eq!(median_abs_diff(&[f32::NAN], &[1.0]), None);
    }
}
