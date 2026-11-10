//! Sources for the composite (seam_viirs.py load_orbits / load_mosaics / hybridise, seam_viirs_p2.py
//! fill_specks). An orbit is held as a full-width row band with >= 16 empty rows of margin, so every
//! filter here gives the same values as on the full grid (the margin is zero, and the big no-data region
//! a band edge touches is never a speck); mosaics are full-height bands.
use crate::edt::edt;
use crate::filters::{dilate_roll, gaussian_wrap};
use crate::grid::{block_mean, smoothstep, subsample, H, W};
use crate::imageio::{rgb, rgba};
use crate::label::small_components;
use crate::quantile::{qmatch, Interp};
use rayon::prelude::*;
use std::path::{Path, PathBuf};

pub const F: usize = 4; // cut resolution = full / F
const MOSAIC_BIAS: f32 = 0.05;
const MOSAIC_BAND: usize = 20;
const N21_BIAS: f32 = 0.02;
const N21_BAND: usize = 40;
const HYBRID_RAMP: f32 = 120.0;
const SPECK_MAX: usize = 400;

pub struct Source {
    pub name: String,
    pub y0: usize, // first row of the band
    pub h: usize,
    pub op: Vec<f32>,
    pub valid: Vec<bool>,
    pub bias: f32,
    pub band: Option<usize>,
    pub gain: bool,
    pub clip_lo: Option<Vec<f32>>, // full low-res grid (H/F x W/F)
}

impl Source {
    pub fn full_valid(&self) -> Vec<bool> {
        let mut v = vec![false; W * H];
        v[self.y0 * W..(self.y0 + self.h) * W].copy_from_slice(&self.valid);
        v
    }

    pub fn full_op(&self) -> Vec<f32> {
        let mut v = vec![0f32; W * H];
        v[self.y0 * W..(self.y0 + self.h) * W].copy_from_slice(&self.op);
        v
    }
}

/// seam_viirs.py opacity() for every (min, max) of an RGB triple, in float32 like numpy.
pub fn opacity_lut() -> Vec<f32> {
    let mut lut = vec![0f32; 256 * 256];
    for mn in 0..256 {
        for mx in mn..256 {
            let (a, b) = (mn as f32 / 255.0, mx as f32 / 255.0);
            let sat = (b - a) / b.max(1e-3);
            let o =
                ((a.powf(2.2) - 0.1) / 0.9).clamp(0.0, 1.0) * (1.0 - smoothstep(0.08, 0.25, sat));
            lut[mn * 256 + mx] = o;
        }
    }
    lut
}

fn min_max(c: &[u8]) -> (usize, usize) {
    (
        c[0].min(c[1]).min(c[2]) as usize,
        c[0].max(c[1]).max(c[2]) as usize,
    )
}

/// GIBS no-data specks under 400 px, filled from their neighbours with a normalised Gaussian.
/// Returns the speck mask (already merged into `valid`).
fn fill_specks(op: &mut [f32], valid: &mut [bool], h: usize) -> usize {
    let inv: Vec<bool> = valid.par_iter().map(|&v| !v).collect();
    let speck = small_components(&inv, h, W, SPECK_MAX);
    let num_in: Vec<f32> = op
        .par_iter()
        .zip(valid.par_iter())
        .map(|(o, &v)| if v { *o } else { 0.0 })
        .collect();
    let den_in: Vec<f32> = valid.par_iter().map(|&v| v as u8 as f32).collect();
    let num = gaussian_wrap(&num_in, h, W, 3.0);
    let den = gaussian_wrap(&den_in, h, W, 3.0);
    op.par_iter_mut()
        .zip(valid.par_iter_mut())
        .enumerate()
        .for_each(|(i, (o, v))| {
            if speck[i] {
                *o = num[i] / den[i].max(1e-6);
                *v = true;
            }
        });
    speck.iter().filter(|&&b| b).count()
}

pub struct OrbitMeta {
    pub name: String,
    pub pieces: Vec<(PathBuf, usize, usize)>, // path, x0, y0
}

/// hi_meta.json grouped into orbits: slots 6 minutes apart belong together. Piece paths are re-rooted
/// under `granules/hi/` so a moved cache still resolves.
pub fn orbit_groups(granules: &Path) -> Vec<OrbitMeta> {
    let meta: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(granules.join("hi_meta.json")).unwrap())
            .unwrap();
    let mut slots: Vec<&String> = meta.as_object().unwrap().keys().collect();
    slots.sort();
    let mins: Vec<i32> = slots
        .iter()
        .map(|s| s[..2].parse::<i32>().unwrap() * 60 + s[2..].parse::<i32>().unwrap())
        .collect();
    let mut groups: Vec<Vec<usize>> = vec![vec![0]];
    for i in 1..slots.len() {
        if mins[i] - mins[i - 1] == 6 {
            groups.last_mut().unwrap().push(i);
        } else {
            groups.push(vec![i]);
        }
    }
    groups
        .iter()
        .map(|g| {
            let pieces = g
                .iter()
                .flat_map(|&i| meta[slots[i].as_str()].as_array().unwrap().iter())
                .map(|p| {
                    let file = Path::new(p["path"].as_str().unwrap())
                        .file_name()
                        .unwrap()
                        .to_owned();
                    (
                        granules.join("hi").join(file),
                        p["x0"].as_u64().unwrap() as usize,
                        p["y0"].as_u64().unwrap() as usize,
                    )
                })
                .collect();
            OrbitMeta {
                name: format!("N20 {}-{}", slots[g[0]], slots[*g.last().unwrap()]),
                pieces,
            }
        })
        .collect()
}

fn load_orbit(m: &OrbitMeta, lut: &[f32]) -> Source {
    let dims: Vec<(usize, usize)> = m
        .pieces
        .iter()
        .map(|p| {
            image::image_dimensions(&p.0)
                .map(|(w, h)| (w as usize, h as usize))
                .unwrap()
        })
        .collect();
    let ymin = m.pieces.iter().map(|p| p.2).min().unwrap();
    let ymax = m
        .pieces
        .iter()
        .zip(&dims)
        .map(|(p, d)| p.2 + d.1)
        .max()
        .unwrap();
    let y0 = (ymin.saturating_sub(16) / 64) * 64;
    let y1 = ((ymax + 16).div_ceil(64) * 64).min(H);
    let h = y1 - y0;
    let mut op = vec![0f32; h * W];
    let mut valid = vec![false; h * W];
    let decoded: Vec<_> = m.pieces.par_iter().map(|p| rgba(&p.0)).collect();
    let mut dark = 0usize;
    for (p, a) in m.pieces.iter().zip(decoded) {
        for yy in 0..a.h {
            let row = (p.2 + yy - y0) * W + p.1;
            for xx in 0..a.w {
                let c = &a.px[(yy * a.w + xx) * 4..][..4];
                if c[3] > 0 {
                    let (mn, mx) = min_max(c);
                    dark += (mx < 4) as usize;
                    op[row + xx] = lut[mn * 256 + mx];
                    valid[row + xx] = true;
                }
            }
        }
    }
    let n_speck = fill_specks(&mut op, &mut valid, h);
    let inv: Vec<bool> = valid.par_iter().map(|&v| !v).collect();
    let fringe = dilate_roll(&inv, h, W, 2, h == H, true);
    valid.par_iter_mut().zip(fringe).for_each(|(v, f)| *v &= !f);
    let nv = valid.iter().filter(|&&b| b).count();
    println!(
        "    filled specks {:.4} of swath",
        n_speck as f64 / nv as f64
    );
    println!(
        "  {}: {} pieces, {:.3} of globe, opaque near-black px {}",
        m.name,
        m.pieces.len(),
        nv as f64 / (W * H) as f64,
        dark
    );
    Source {
        name: m.name.clone(),
        y0,
        h,
        op,
        valid,
        bias: 0.0,
        band: None,
        gain: true,
        clip_lo: None,
    }
}

pub fn load_orbits(granules: &Path, lut: &[f32]) -> Vec<Source> {
    orbit_groups(granules)
        .iter()
        .map(|m| load_orbit(m, lut))
        .collect()
}

/// The GIBS daily mosaics (JPEG), N20 then N21 as its own source; each speck-filled (p2).
pub fn load_mosaics(viirs: &Path, lut: &[f32]) -> Vec<Source> {
    let spec = [
        (
            "daily mosaic N20",
            "viirs_tc",
            MOSAIC_BIAS,
            MOSAIC_BAND,
            false,
        ),
        ("daily mosaic N21", "viirs21_tc", N21_BIAS, N21_BAND, true),
    ];
    spec.iter()
        .map(|&(name, f, bias, band, gain)| {
            let (w, h, px) = rgb(&viirs.join(format!("{f}_{}.jpg", crate::fetch::day())));
            assert_eq!((w, h), (W, H));
            let dark: Vec<bool> = px
                .par_chunks(3)
                .map(|c| c[0].max(c[1]).max(c[2]) < 12)
                .collect();
            let nd = dilate_roll(&dark, H, W, 2, true, false);
            let mut valid: Vec<bool> = nd.par_iter().map(|&b| !b).collect();
            let mut op: Vec<f32> = px
                .par_chunks(3)
                .zip(valid.par_iter())
                .map(|(c, &v)| {
                    let (mn, mx) = min_max(c);
                    if v {
                        lut[mn * 256 + mx]
                    } else {
                        0.0
                    }
                })
                .collect();
            let n = fill_specks(&mut op, &mut valid, H);
            println!("    {name}: filled {n} speck px");
            Source {
                name: name.into(),
                y0: 0,
                h: H,
                op,
                valid,
                bias,
                band: Some(band),
                gain,
                clip_lo: None,
            }
        })
        .collect()
}

/// seam_viirs.py hybridise(): granule values (quantile-mapped onto the mosaic's gentler stretch) only where
/// orbits overlap, ramped over HYBRID_RAMP px; the mosaic elsewhere. Also records each orbit's clip_lo.
pub fn hybridise(orbits: &mut [Source], mos: &Source) {
    let mut cnt = vec![0u8; W * H];
    for o in orbits.iter() {
        cnt[o.y0 * W..(o.y0 + o.h) * W]
            .par_iter_mut()
            .zip(o.valid.par_iter())
            .for_each(|(c, &v)| *c += v as u8);
    }
    orbits.iter_mut().for_each(|o| {
        let (y0, h) = (o.y0, o.h);
        let cnt = &cnt[y0 * W..(y0 + h) * W];
        let mop = &mos.op[y0 * W..(y0 + h) * W];
        let mval = &mos.valid[y0 * W..(y0 + h) * W];
        let clipped: Vec<f32> =
            o.op.par_iter()
                .zip(o.valid.par_iter())
                .map(|(&g, &v)| (g >= 0.98 && v) as u8 as f32)
                .collect();
        let mut clip_lo = vec![0f32; (H / F) * (W / F)];
        clip_lo[(y0 / F) * (W / F)..((y0 + h) / F) * (W / F)]
            .copy_from_slice(&block_mean(&clipped, h, W, F));
        o.clip_lo = Some(clip_lo);
        let single: Vec<bool> = (0..h * W)
            .into_par_iter()
            .map(|i| o.valid[i] && cnt[i] == 1 && mval[i])
            .collect();
        if single.iter().filter(|&&b| b).count() < 100_000 {
            return;
        }
        let q: Interp = qmatch(
            &subsample(&o.op, h, W, 2),
            &subsample(mop, h, W, 2),
            &subsample(&single, h, W, 2),
        );
        let cw = gaussian_wrap(&clipped, h, W, 2.0);
        let multi_inv: Vec<bool> = (0..h * W)
            .into_par_iter()
            .map(|i| !(o.valid[i] && cnt[i] >= 2))
            .collect();
        let dist = edt(&multi_inv, h, W, y0);
        let mut kept = (0usize, 0usize);
        let new: Vec<(f32, bool)> = (0..h * W)
            .into_par_iter()
            .map(|i| {
                if !o.valid[i] {
                    return (0.0, false);
                }
                let cwi = cw[i] * smoothstep(0.5, 0.7, mop[i]);
                let qi = cwi * mop[i] + (1.0 - cwi) * q.eval(o.op[i]);
                let wgt = if mval[i] {
                    smoothstep(0.0, 1.0, 1.0 - dist[i] / HYBRID_RAMP)
                } else {
                    1.0
                };
                (wgt * qi + (1.0 - wgt) * mop[i], wgt > 0.5)
            })
            .collect();
        for (i, (v, k)) in new.into_iter().enumerate() {
            o.op[i] = v;
            kept.0 += k as usize;
            kept.1 += o.valid[i] as usize;
        }
        println!(
            "    {}: granule values kept on {:.2} of the swath",
            o.name,
            kept.0 as f64 / kept.1 as f64
        );
    });
}
