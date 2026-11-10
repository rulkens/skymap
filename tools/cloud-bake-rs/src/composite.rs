//! The running composite (seam_viirs_p2.py `composite` with P2_FLOW=0): sources join one at a time —
//! gain match on the overlap, min-cut label at 2048x1024, multiband blend at full res — then enclosed
//! holes are push-pull filled and the result is quantile-matched to the shipped baseline.
use crate::blend;
use crate::edt::edt;
use crate::filters::gaussian_wrap;
use crate::grid::{block_majority, block_mean, smoothstep, subsample, upsample, H, W};
use crate::label::{count_components, small_components};
use crate::quantile::{qmatch, Interp};
use crate::seam::{cut, fit_gain, nadirness, CutIn};
use crate::sources::{Source, F};
use rayon::prelude::*;

const GAIN_RAMP: f32 = 50.0;
const HOLE_MAX: usize = 20000;

pub struct Composite {
    pub op: Vec<f32>,
    pub cv: Vec<bool>,
    pub labels: Vec<i8>,
    pub names: Vec<String>,
}

pub fn join_all(
    sources: Vec<Source>,
    display: &Interp,
) -> (Vec<f32>, Vec<bool>, Vec<i8>, Vec<String>) {
    let (h, w) = (H / F, W / F);
    let names: Vec<String> = sources.iter().map(|s| s.name.clone()).collect();
    let mut c = vec![0f32; W * H];
    let mut cv = vec![false; W * H];
    let mut labels = vec![-1i8; W * H];
    let mut nc = vec![0f32; h * w];
    let mut clip_c = vec![0f32; h * w];
    let zeros_lo = vec![0f32; h * w];
    for (k, src) in sources.into_iter().enumerate() {
        let sv = src.full_valid();
        let mut s = src.full_op();
        let o: Vec<bool> = cv
            .par_iter()
            .zip(sv.par_iter())
            .map(|(&a, &b)| a && b)
            .collect();
        let (mut g, mut off, npx) = fit_gain(&c, &s, &o, H, W);
        if !src.gain {
            (g, off) = (1.0, 0.0);
        }
        let svl = block_majority(&sv, H, W, F);
        let cvl = block_majority(&cv, H, W, F);
        if (g, off) != (1.0, 0.0) {
            let not_ov: Vec<bool> = cvl.par_iter().zip(&svl).map(|(&a, &b)| !(a && b)).collect();
            let d = edt(&not_ov, h, w, 0);
            let r: Vec<f32> = d
                .par_iter()
                .map(|&x| smoothstep(0.0, 1.0, 1.0 - x / GAIN_RAMP))
                .collect();
            let r = upsample(&gaussian_wrap(&r, h, w, 2.0), h, w, F);
            s.par_iter_mut().zip(&r).for_each(|(x, &r)| {
                *x = ((1.0 + (g - 1.0) * r) * *x + r * off * (*x / 0.3).min(1.0)).clamp(0.0, 1.0)
            });
        }
        let ns = if src.band.is_some() {
            vec![0f32; h * w]
        } else {
            nadirness(&svl, h, w)
        };
        let clip_s = src.clip_lo.as_deref().unwrap_or(&zeros_lo);
        let n_ov = o.iter().filter(|&&b| b).count();
        let (lab, flow, m);
        if !cv.iter().any(|&b| b) {
            m = sv.clone();
            c = s;
            lab = svl;
            flow = 0.0;
        } else {
            // block means of Af = where(Cv, C, S) and Bf = where(Sv, S, C)
            let af: Vec<f32> = (0..W * H)
                .into_par_iter()
                .map(|i| if cv[i] { c[i] } else { s[i] })
                .collect();
            let a_lo = block_mean(&af, H, W, F);
            let bf: Vec<f32> = (0..W * H)
                .into_par_iter()
                .map(|i| if sv[i] { s[i] } else { c[i] })
                .collect();
            let b_lo = block_mean(&bf, H, W, F);
            drop(bf);
            let x = CutIn {
                a: &a_lo,
                b: &b_lo,
                cv: &cvl,
                sv: &svl,
                nc: &nc,
                ns: &ns,
                bias: src.bias,
                band: src.band,
                clip_c: &clip_c,
                clip_s,
            };
            (lab, flow) = cut(&x, h, w, display);
            let lab_full = upsample(&lab, h, w, F);
            m = (0..W * H)
                .into_par_iter()
                .map(|i| (lab_full[i] && sv[i]) || (sv[i] && !cv[i]))
                .collect::<Vec<bool>>();
            drop(lab_full);
            let diff: Vec<bool> = (0..W * H)
                .into_par_iter()
                .map(|i| af[i] != if sv[i] { s[i] } else { c[i] })
                .collect();
            let mut out = af;
            if let Some(win) = blend::window(&diff) {
                let (cr, sr, cvr, svr, mr) = (&c, &s, &cv, &sv, &m);
                blend::add_residual(
                    &mut out,
                    &win,
                    |i| (if svr[i] { sr[i] } else { cr[i] }) - (if cvr[i] { cr[i] } else { sr[i] }),
                    |i| mr[i] as u8 as f32,
                );
            }
            c = out;
        }
        c.par_iter_mut().enumerate().for_each(|(i, x)| {
            if !(cv[i] || sv[i]) {
                *x = 0.0;
            }
        });
        let took = if n_ov > 0 {
            (0..W * H).filter(|&i| o[i] && m[i]).count() as f64 / n_ov as f64
        } else {
            1.0
        };
        labels.par_iter_mut().zip(m.par_iter()).for_each(|(l, &b)| {
            if b {
                *l = k as i8;
            }
        });
        for i in 0..h * w {
            if lab[i] {
                nc[i] = ns[i];
                clip_c[i] = src.clip_lo.as_ref().map_or(0.0, |v| v[i]);
            }
        }
        cv.par_iter_mut()
            .zip(sv.par_iter())
            .for_each(|(a, &b)| *a |= b);
        eprintln!(
            "  [{k:2}] {:<22} overlap {:.4} gain {g:.3} off {off:+.3} ({npx} px) took {took:.3} flow {flow:.0}",
            src.name,
            n_ov as f64 / (W * H) as f64
        );
    }
    (c, cv, labels, names)
}

/// Enclosed no-data holes under HOLE_MAX px filled by push-pull interpolation from the composite.
pub fn fill_holes(c: &mut [f32], cv: &mut [bool]) {
    let inv: Vec<bool> = cv.par_iter().map(|&b| !b).collect();
    let hole = small_components(&inv, H, W, HOLE_MAX);
    let n = hole.iter().filter(|&&b| b).count();
    if n == 0 {
        return;
    }
    let mut xs = vec![c
        .par_iter()
        .zip(cv.par_iter())
        .map(|(&x, &v)| if v { x } else { 0.0 })
        .collect::<Vec<f32>>()];
    let mut ms = vec![cv.par_iter().map(|&v| v as u8 as f32).collect::<Vec<f32>>()];
    let mut dims = vec![(H, W)];
    while dims.last().unwrap().0 > 4 {
        let (hh, ww) = *dims.last().unwrap();
        let sum2 = |x: &[f32]| -> Vec<f32> {
            (0..(hh / 2) * (ww / 2))
                .into_par_iter()
                .map(|i| {
                    let (y, x_) = (i / (ww / 2) * 2, i % (ww / 2) * 2);
                    x[y * ww + x_]
                        + x[y * ww + x_ + 1]
                        + x[(y + 1) * ww + x_]
                        + x[(y + 1) * ww + x_ + 1]
                })
                .collect()
        };
        let (nx, nm) = (sum2(xs.last().unwrap()), sum2(ms.last().unwrap()));
        xs.push(nx);
        ms.push(nm);
        dims.push((hh / 2, ww / 2));
    }
    let top = xs.len() - 1;
    let mut v: Vec<f32> = xs[top]
        .iter()
        .zip(&ms[top])
        .map(|(x, m)| x / m.max(1e-6))
        .collect();
    for l in (0..top).rev() {
        let (hh, ww) = dims[l];
        let up = upsample(&v, hh / 2, ww / 2, 2);
        v = (0..hh * ww)
            .into_par_iter()
            .map(|i| {
                let wgt = ms[l][i].min(1.0);
                wgt * xs[l][i] / ms[l][i].max(1e-6) + (1.0 - wgt) * up[i]
            })
            .collect();
    }
    eprintln!(
        "  enclosed holes filled: {} components, {n} px",
        count_components(&hole, H, W)
    );
    c.par_iter_mut()
        .zip(cv.par_iter_mut())
        .enumerate()
        .for_each(|(i, (x, m))| {
            if hole[i] {
                *x = v[i];
                *m = true;
            }
        });
}

/// bake.py match_baseline over `mask` (here Cv & C > 0): quantile-map op onto the baseline's opacity.
pub fn match_baseline(op: &[f32], mask: &[bool], base: &[f32]) -> Vec<f32> {
    let f = qmatch(
        &subsample(op, H, W, 2),
        &subsample(base, H, W, 2),
        &subsample(mask, H, W, 2),
    );
    let out = f.apply(op);
    let (mut a, mut b, mut cnt) = (0f64, 0f64, 0usize);
    for i in 0..op.len() {
        if mask[i] {
            a += op[i] as f64;
            b += out[i] as f64;
            cnt += 1;
        }
    }
    eprintln!(
        "  match: src mean {:.3} -> {:.3} over {:.2} of globe",
        a / cnt as f64,
        b / cnt as f64,
        cnt as f64 / op.len() as f64
    );
    out
}

impl Composite {
    pub fn build(sources: Vec<Source>, display: &Interp, base: &[f32]) -> Composite {
        let (mut c, mut cv, labels, names) = join_all(sources, display);
        c.par_iter_mut().for_each(|x| *x = x.clamp(0.0, 1.0));
        fill_holes(&mut c, &mut cv);
        let mask: Vec<bool> = c
            .par_iter()
            .zip(cv.par_iter())
            .map(|(&x, &v)| v && x > 0.0)
            .collect();
        let op = match_baseline(&c, &mask, base);
        Composite {
            op,
            cv,
            labels,
            names,
        }
    }
}
