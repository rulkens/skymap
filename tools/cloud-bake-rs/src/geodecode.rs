//! Geostationary IR frame -> opacity layer, exactly as bake.py ir() maps it: the GIBS 'Infrared
//! Brightness Temperature' colour map inverted (exact entry, else nearest; greys only against the warm
//! ramp) with the cold-core fix, the frozen MTG/IODC grey->T LUTs, and the cos^3 view-angle disc weight.
use crate::fetch::FrameReq;
use crate::grid::{lat, lon, smoothstep64, W};
use crate::imageio::Rgba;
use crate::label::{closing, fill_holes, small_components};
use crate::quantile::Interp;
use std::collections::HashMap;

pub fn sub_lon(sat: &str) -> f64 {
    match sat {
        "goes_e" => -75.2,
        "goes_w" => -137.0,
        "hima" => 140.7,
        "mtg" => 0.0,
        _ => 45.5,
    }
}

/// Only IODC has a longitude window (fetched for 28.125..118.125 E and ramped in from the cut edges).
pub fn lon_in(sat: &str, lon: f64) -> bool {
    sat != "iodc" || (28.125..=118.125).contains(&lon)
}

pub fn view_angle(sat: &str, row: usize, col: usize) -> f64 {
    (lat(row).to_radians().cos() * (lon(col) - sub_lon(sat)).to_radians().cos())
        .clamp(-1.0, 1.0)
        .acos()
        .to_degrees()
}

/// Frozen inputs, provenance in assets/README.md; compiled in so a bake cannot run against other tables.
const COLORMAP_XML: &str = include_str!("../assets/gibs-ir-colormap.xml");
const CALIB_JSON: &str = include_str!("../assets/geo-calib.json");

pub struct Decoder {
    e: Vec<[f32; 4]>,
    warm: Vec<[f32; 4]>,
    exact: HashMap<u32, f32>,
    core: Interp,     // cold-core greys -> T
    warm_rev: Interp, // ambiguous greys reassigned to the warm ramp
    mtg_lut: Vec<f32>,
    iodc_lut: Vec<f32>,
    pub qmap: Interp, // frozen 12:00Z blend -> baseline quantile map
}

impl Decoder {
    pub fn new() -> Decoder {
        let xml = COLORMAP_XML;
        let mut e = Vec::new();
        for line in xml.lines() {
            let Some(i) = line.find("rgb=\"") else {
                continue;
            };
            if !line.contains("transparent=\"false\"") {
                continue;
            }
            let rgb: Vec<f32> = line[i + 5..]
                .split('"')
                .next()
                .unwrap()
                .split(',')
                .map(|v| v.parse().unwrap())
                .collect();
            let Some(j) = line.find(" value=\"") else {
                continue;
            };
            let v = &line[j + 8..];
            let body = &v[1..v.find(['"']).unwrap()];
            let body = body.trim_end_matches([']', ')']);
            let (lo, hi) = body.split_once(',').unwrap();
            let lo: f64 = lo.parse().unwrap();
            let hi: f64 = if hi.contains("INF") {
                lo + 1.0
            } else {
                hi.parse().unwrap()
            };
            e.push([rgb[0], rgb[1], rgb[2], ((lo + hi) / 2.0) as f32]);
        }
        let exact = e
            .iter()
            .map(|c| {
                (
                    ((c[0] as u32) << 16) | ((c[1] as u32) << 8) | c[2] as u32,
                    c[3],
                )
            })
            .collect();
        let warm: Vec<[f32; 4]> = e.iter().filter(|c| c[3] > -19.2).copied().collect();
        let mut cg: Vec<(f64, f64)> = e
            .iter()
            .filter(|c| c[0] == c[1] && c[1] == c[2] && c[3] < -60.0)
            .map(|c| (c[0] as f64, c[3] as f64))
            .collect();
        cg.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let core = Interp {
            xp: cg.iter().map(|c| c.0).collect(),
            fp: cg.iter().map(|c| c.1).collect(),
        };
        let warm_rev = Interp {
            xp: warm.iter().rev().map(|c| c[0] as f64).collect(),
            fp: warm.iter().rev().map(|c| c[3] as f64).collect(),
        };
        let cal: serde_json::Value = serde_json::from_str(CALIB_JSON).unwrap();
        let arr = |k: &str| {
            cal[k]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v.as_f64().unwrap())
                .collect::<Vec<f64>>()
        };
        let qmap = Interp::quantile_map(&arr("qs"), &arr("qr"));
        Decoder {
            e,
            warm,
            exact,
            core,
            warm_rev,
            mtg_lut: arr("mtg_lut").iter().map(|&v| v as f32).collect(),
            iodc_lut: arr("iodc_lut").iter().map(|&v| v as f32).collect(),
            qmap,
        }
    }

    fn nearest(&self, k: u32) -> f32 {
        let c = [
            (k >> 16 & 255) as f32,
            (k >> 8 & 255) as f32,
            (k & 255) as f32,
        ];
        let spread =
            c.iter().cloned().fold(f32::MIN, f32::max) - c.iter().cloned().fold(f32::MAX, f32::min);
        let pool = if spread <= 3.0 { &self.warm } else { &self.e };
        let mut best = (f32::INFINITY, 0.0);
        for p in pool {
            let d = (p[0] - c[0]).powi(2) + (p[1] - c[1]).powi(2) + (p[2] - c[2]).powi(2);
            if d < best.0 {
                best = (d, p[3]);
            }
        }
        best.1
    }

    /// geofill.py gibs_T: brightness temperature (NaN where transparent) with the cold-core fix.
    fn gibs_t(&self, a: &Rgba, core_max: usize) -> Vec<f32> {
        let (h, w) = (a.h, a.w);
        let mut memo: HashMap<u32, f32> = HashMap::new();
        let mut t = vec![f32::NAN; h * w];
        for i in 0..h * w {
            let c = &a.px[i * 4..i * 4 + 4];
            if c[3] > 0 {
                let k = ((c[0] as u32) << 16) | ((c[1] as u32) << 8) | c[2] as u32;
                t[i] = match self.exact.get(&k) {
                    Some(&v) => v,
                    None => *memo.entry(k).or_insert_with(|| self.nearest(k)),
                };
            }
        }
        let px = |i: usize| {
            (
                a.px[i * 4] as i32,
                a.px[i * 4 + 1] as i32,
                a.px[i * 4 + 2] as i32,
                a.px[i * 4 + 3] > 0,
            )
        };
        let greyish = |i: usize| {
            let (r, g, b, v) = px(i);
            v && (r - g).abs() <= 3 && (g - b).abs() <= 3
        };
        let seed: Vec<bool> = (0..h * w)
            .map(|i| px(i).3 && !greyish(i) && t[i] < -40.0)
            .collect();
        let filled = fill_holes(&closing(&seed, h, w, 2), h, w);
        let holes: Vec<bool> = (0..h * w).map(|i| filled[i] && !seed[i]).collect();
        let small = small_components(&holes, h, w, core_max);
        for i in 0..h * w {
            let keep = seed[i] || small[i];
            let (r, g, b, v) = px(i);
            if greyish(i) && keep {
                t[i] = self.core.eval(r as f32);
            } else if v
                && r == g
                && g == b
                && [177, 155, 129, 102, 76, 54, 27, 5].contains(&r)
                && !keep
            {
                t[i] = self.warm_rev.eval(r as f32);
            }
        }
        t
    }

    /// geofill.py sat_layer: (w * val, w, fade) over the request's window at its scale.
    pub fn layer(&self, r: &FrameReq, mut a: Rgba) -> (Vec<f32>, Vec<f32>, Vec<f32>) {
        let s = r.scale;
        let (h, w) = (a.h, a.w);
        let rows: Vec<usize> = (0..h).map(|i| r.y0 + i * s).collect();
        let cols: Vec<usize> = (0..w).map(|j| (r.x0 + j * s) % W).collect();
        let ang: Vec<f64> = rows
            .iter()
            .flat_map(|&y| cols.iter().map(move |&x| view_angle(r.sat, y, x)))
            .collect();
        let (t, mut ok): (Vec<f32>, Vec<f64>) = if r.sat == "mtg" || r.sat == "iodc" {
            let lut = if r.sat == "mtg" {
                &self.mtg_lut
            } else {
                &self.iodc_lut
            };
            (0..h * w)
                .map(|i| {
                    let c = &a.px[i * 4..i * 4 + 4];
                    if c[3] > 0 {
                        (lut[c[0] as usize], 1.0)
                    } else {
                        (f32::NAN, 0.0)
                    }
                })
                .unzip()
        } else {
            for i in 0..h * w {
                let c = &mut a.px[i * 4..i * 4 + 4];
                if ang[i] > 75.0 && c[0] == 255 && c[1] == 255 && c[2] == 255 {
                    c[3] = 0;
                }
            }
            let t = self.gibs_t(&a, 20000 / (s * s));
            let ok = (0..h * w)
                .map(|i| (a.px[i * 4 + 3] > 0) as u8 as f64)
                .collect();
            (t, ok)
        };
        for i in 0..h * w {
            let lo = lon(cols[i % w]);
            if r.sat == "iodc" {
                ok[i] *= smoothstep64(28.125, 38.0, lo) * (1.0 - smoothstep64(108.0, 118.125, lo));
            }
            ok[i] *= lon_in(r.sat, lo) as u8 as f64;
        }
        let mut wv = vec![0f32; h * w];
        let mut wk = vec![0f32; h * w];
        let mut fd = vec![0f32; h * w];
        for i in 0..h * w {
            let v = ((15.0 - t[i]) / 65.0).clamp(0.0, 1.0);
            let v = if v.is_nan() { 0.0 } else { v };
            let fade = (1.0 - smoothstep64(62.0, 76.0, ang[i])) * ok[i];
            let k = fade * ang[i].min(89.0).to_radians().cos().powi(3);
            wv[i] = (k * v as f64) as f32;
            wk[i] = k as f32;
            fd[i] = fade as f32;
        }
        (wv, wk, fd)
    }
}
