//! The per-join seam decision at cut resolution (seam_viirs.py fit_gain, nadirness, edge_weights, cut).
use crate::edt::edt;
use crate::filters::{max3_wrap, sobel_grad};
use crate::maxflow;
use crate::quantile::{percentiles, polyfit1, Interp};
use rayon::prelude::*;

const ALPHA: f32 = 1.0;
const BETA: f32 = 1.0;
const DELTA: f32 = 0.5;
const EPS: f32 = 0.02;
const LAMBDA: f32 = 0.02;
const CLIP_COST: f32 = 0.05;
const INF: f32 = 1e9;

/// Robust gain/offset S -> C on pixels cloudy in both (every other row and column): a line through the
/// 10..90th percentile pairs. Returns (gain, offset, pixel count).
pub fn fit_gain(c: &[f32], s: &[f32], o: &[bool], h: usize, w: usize) -> (f32, f32, usize) {
    let (mut sv, mut cv): (Vec<f32>, Vec<f32>) = (0..h / 2)
        .into_par_iter()
        .flat_map_iter(|y| (0..w / 2).map(move |x| (2 * y) * w + 2 * x))
        .filter(|&i| o[i] && c[i] > 0.3 && s[i] > 0.3)
        .map(|i| (s[i], c[i]))
        .unzip();
    let n = sv.len();
    if n < 20_000 {
        return (1.0, 0.0, n);
    }
    let q: Vec<f64> = (0..17).map(|i| 10.0 + 5.0 * i as f64).collect();
    let (g, off) = polyfit1(&percentiles(&mut sv, &q), &percentiles(&mut cv, &q));
    (
        (g as f32).clamp(0.7, 1.4),
        (off as f32).clamp(-0.15, 0.15),
        n,
    )
}

/// Cross-track position in the swath per row: 1 at nadir, 0 at the edge.
pub fn nadirness(v: &[bool], h: usize, w: usize) -> Vec<f32> {
    let s = (0..w).find(|&c| (0..h).all(|r| !v[r * w + c])).unwrap_or(0);
    let mut out = vec![0f32; h * w];
    out.par_chunks_mut(w).enumerate().for_each(|(r, o)| {
        let rv: Vec<bool> = (0..w).map(|j| v[r * w + (j + s) % w]).collect();
        let mut left = vec![0i64; w];
        let mut last = -1i64;
        for j in 0..w {
            if !rv[j] {
                last = j as i64;
            }
            left[j] = j as i64 - last;
        }
        let mut next = w as i64;
        for j in (0..w).rev() {
            if !rv[j] {
                next = j as i64;
            }
            let right = next - j as i64;
            let run = left[j] + right - 1;
            let n = if rv[j] {
                left[j].min(right) as f64 / (run as f64 / 2.0).max(1.0)
            } else {
                0.0
            };
            o[(j + s) % w] = n as f32;
        }
    });
    out
}

/// Cut cost between 4-neighbours (right, down). The DELTA term is a constant per edge: a real cloud-edge
/// cost (exp(-d/3) to the 0.25 contour) was tried 2026-11-07 and moved cuts into worse places (s5 crop).
fn edge_weights(
    a: &[f32],
    b: &[f32],
    o: &[bool],
    any: &[bool],
    h: usize,
    w: usize,
    display: &Interp,
) -> (Vec<f64>, Vec<f64>) {
    let d0: Vec<f32> = (0..h * w)
        .into_par_iter()
        .map(|i| {
            if o[i] {
                (display.eval(a[i]) - display.eval(b[i])).abs()
            } else {
                0.0
            }
        })
        .collect();
    let mx = max3_wrap(&d0, h, w);
    let d: Vec<f32> = (0..h * w)
        .into_par_iter()
        .map(|i| d0[i].max(if o[i] { 0.0 } else { mx[i] }))
        .collect();
    let (ga, gb) = (sobel_grad(a, h, w), sobel_grad(b, h, w));
    let g: Vec<f32> = ga.par_iter().zip(&gb).map(|(x, y)| x.max(*y)).collect();
    let cost = |p: usize, q: usize| {
        let c = EPS + ALPHA * (d[p] + d[q]) + BETA * g[p].max(g[q]) + DELTA;
        if any[p] && any[q] {
            c as f64
        } else {
            0.0
        }
    };
    let right = (0..h * w)
        .into_par_iter()
        .map(|p| cost(p, (p / w) * w + (p % w + 1) % w))
        .collect();
    let down = (0..h * w)
        .into_par_iter()
        .map(|p| if p / w + 1 < h { cost(p, p + w) } else { 0.0 })
        .collect();
    (right, down)
}

pub struct CutIn<'a> {
    pub a: &'a [f32],
    pub b: &'a [f32],
    pub cv: &'a [bool],
    pub sv: &'a [bool],
    pub nc: &'a [f32],
    pub ns: &'a [f32],
    pub bias: f32,
    pub band: Option<usize>,
    pub clip_c: &'a [f32],
    pub clip_s: &'a [f32],
}

/// Binary min-cut at low res; true = take the new source. Returns (label, flow).
pub fn cut(x: &CutIn, h: usize, w: usize, display: &Interp) -> (Vec<bool>, f64) {
    let n = h * w;
    let o: Vec<bool> = (0..n).into_par_iter().map(|i| x.cv[i] && x.sv[i]).collect();
    let any: Vec<bool> = (0..n).into_par_iter().map(|i| x.cv[i] || x.sv[i]).collect();
    let (right, down) = edge_weights(x.a, x.b, &o, &any, h, w, display);
    let deep = x.band.map(|b| (edt(x.cv, h, w, 0), b as f32));
    let ds: Vec<f64> = (0..n)
        .into_par_iter()
        .map(|i| {
            let mut v = if o[i] {
                LAMBDA * (x.nc[i] - x.ns[i]).max(0.0) + x.bias + CLIP_COST * x.clip_s[i]
            } else {
                0.0
            };
            if x.cv[i] && !x.sv[i] {
                v = INF;
            }
            if let Some((dist, band)) = &deep {
                if x.cv[i] && dist[i] > *band {
                    v = INF;
                }
            }
            v as f64
        })
        .collect();
    let dc: Vec<f64> = (0..n)
        .into_par_iter()
        .map(|i| {
            let v = if o[i] {
                LAMBDA * (x.ns[i] - x.nc[i]).max(0.0) + CLIP_COST * x.clip_c[i]
            } else {
                0.0
            };
            (if x.sv[i] && !x.cv[i] { INF } else { v }) as f64
        })
        .collect();
    let mut g = maxflow::Grid::new(h, w, &right, &down, &ds, &dc);
    let flow = g.maxflow();
    let lab = g
        .segments()
        .into_iter()
        .zip(x.sv)
        .map(|(s, &v)| s && v)
        .collect();
    (lab, flow)
}
