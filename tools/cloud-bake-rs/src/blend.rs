//! Burt & Adelson multiband blend (seam_viirs.py `multiband`), computed only around the pixels where the
//! two inputs differ. The blend is linear in (A, B), and reconstructing a Laplacian pyramid of A alone
//! returns A, so multiband(A, B, M) = A + E with E = multiband(0, B - A, M). B - A is zero away from the
//! overlap and every kernel is finite (radius 4 per level), so E vanishes beyond ~600 px of that support;
//! the crop adds MARGIN so the mask pyramid's crop-edge clamping (~510 px at level 6) never reaches E.
use crate::filters::{gauss_kernel, Edge};
use crate::grid::{arc, H, W};
use rayon::prelude::*;

const LEVELS: usize = 6;
pub const MARGIN: usize = 1024;
const ALIGN: usize = 64; // 2^LEVELS: keeps every level's even samples on the full-grid lattice

fn ix(i: i64, n: usize, e: Edge) -> usize {
    match e {
        Edge::Clamp => i.clamp(0, n as i64 - 1) as usize,
        Edge::Wrap => i.rem_euclid(n as i64) as usize,
    }
}

/// gaussian_filter(x, 1, WRAP)[::2, ::2], computing only the kept samples.
fn pyr_down(x: &[f32], h: usize, w: usize, ce: Edge, k: &[f32]) -> Vec<f32> {
    let r = (k.len() / 2) as i64;
    let (oh, ow) = (h / 2, w / 2);
    let mut v = vec![0f32; oh * w];
    v.par_chunks_mut(w).enumerate().for_each(|(oy, o)| {
        for (j, &kj) in k.iter().enumerate() {
            let sy = ix(2 * oy as i64 + j as i64 - r, h, Edge::Clamp);
            o.iter_mut()
                .zip(&x[sy * w..(sy + 1) * w])
                .for_each(|(a, b)| *a += kj * b);
        }
    });
    let mut out = vec![0f32; oh * ow];
    out.par_chunks_mut(ow).enumerate().for_each(|(y, o)| {
        let row = &v[y * w..(y + 1) * w];
        for (ox, a) in o.iter_mut().enumerate() {
            *a = k
                .iter()
                .enumerate()
                .map(|(j, &kj)| kj * row[ix(2 * ox as i64 + j as i64 - r, w, ce)])
                .sum();
        }
    });
    out
}

/// gaussian_filter(np.repeat(np.repeat(x, 2, 0), 2, 1), 1, WRAP) without materialising the repeat.
fn pyr_up(x: &[f32], h: usize, w: usize, ce: Edge, k: &[f32]) -> Vec<f32> {
    let r = (k.len() / 2) as i64;
    let (oh, ow) = (2 * h, 2 * w);
    let mut v = vec![0f32; oh * w];
    v.par_chunks_mut(w).enumerate().for_each(|(oy, o)| {
        for (j, &kj) in k.iter().enumerate() {
            let sy = ix(oy as i64 + j as i64 - r, oh, Edge::Clamp) / 2;
            o.iter_mut()
                .zip(&x[sy * w..(sy + 1) * w])
                .for_each(|(a, b)| *a += kj * b);
        }
    });
    let mut out = vec![0f32; oh * ow];
    out.par_chunks_mut(ow).enumerate().for_each(|(y, o)| {
        let row = &v[y * w..(y + 1) * w];
        let pad: Vec<f32> = (0..ow + 2 * r as usize)
            .map(|i| row[ix(i as i64 - r, ow, ce) / 2])
            .collect();
        for (j, &kj) in k.iter().enumerate() {
            o.iter_mut()
                .zip(&pad[j..j + ow])
                .for_each(|(a, b)| *a += kj * b);
        }
    });
    out
}

/// E = multiband(0, d, m) on an h x w window.
fn residual(d: Vec<f32>, m: Vec<f32>, h: usize, w: usize, ce: Edge) -> Vec<f32> {
    let k = gauss_kernel(1.0);
    let (mut dl, mut gm, mut lap) = (d, vec![m], Vec::with_capacity(LEVELS));
    for l in 0..LEVELS {
        let (lh, lw) = (h >> l, w >> l);
        let d2 = pyr_down(&dl, lh, lw, ce, &k);
        let up = pyr_up(&d2, lh / 2, lw / 2, ce, &k);
        lap.push(
            dl.par_iter()
                .zip(&up)
                .map(|(a, b)| a - b)
                .collect::<Vec<f32>>(),
        );
        gm.push(pyr_down(&gm[l], lh, lw, ce, &k));
        dl = d2;
    }
    // The coarsest band (>~64 px) deliberately takes the side the seam did NOT choose: each side keeps the
    // low frequencies of the swath that continues beyond the overlap, which hides residual gain mismatch.
    // Weighting it like the finer bands was tried 2026-11-07 and showed dark blocks (h1 crop).
    let mut out: Vec<f32> = dl
        .par_iter()
        .zip(&gm[LEVELS])
        .map(|(b, g)| (1.0 - g) * b)
        .collect();
    for l in (0..LEVELS).rev() {
        let (lh, lw) = (h >> l, w >> l);
        out = pyr_up(&out, lh / 2, lw / 2, ce, &k);
        out.par_iter_mut()
            .zip(&gm[l])
            .zip(&lap[l])
            .for_each(|((o, g), b)| *o += g * b);
    }
    out
}

pub struct Window {
    pub y0: usize,
    pub h: usize,
    pub x0: usize,
    pub w: usize, // == W: full width, columns wrap
}

/// The aligned window covering every pixel where `diff` is true, plus MARGIN (wrap-aware in longitude).
pub fn window(diff: &[bool], margin: usize) -> Option<Window> {
    let rows: Vec<bool> = diff.par_chunks(W).map(|r| r.iter().any(|&b| b)).collect();
    let (r0, r1) = (
        rows.iter().position(|&b| b)?,
        rows.iter().rposition(|&b| b).unwrap() + 1,
    );
    let cols: Vec<bool> = (0..W)
        .into_par_iter()
        .map(|c| (r0..r1).any(|r| diff[r * W + c]))
        .collect();
    let y0 = r0.saturating_sub(margin) / ALIGN * ALIGN;
    let y1 = ((r1 + margin).div_ceil(ALIGN) * ALIGN).min(H);
    let (c0, n) = arc(&cols);
    let x0 = (c0 + W - margin % W) % W / ALIGN * ALIGN;
    let span = (c0 + W - x0) % W + n + margin;
    let w = span.div_ceil(ALIGN) * ALIGN;
    Some(if w >= W {
        Window {
            y0,
            h: y1 - y0,
            x0: 0,
            w: W,
        }
    } else {
        Window {
            y0,
            h: y1 - y0,
            x0,
            w,
        }
    })
}

/// out += multiband(0, d, m) over the window, where d and m are given per full-grid pixel.
pub fn add_residual(
    out: &mut [f32],
    win: &Window,
    d: impl Fn(usize) -> f32 + Sync,
    m: impl Fn(usize) -> f32 + Sync,
) {
    let (h, w) = (win.h, win.w);
    let at = |i: usize| (win.y0 + i / w) * W + (win.x0 + i % w) % W;
    let dc: Vec<f32> = (0..h * w).into_par_iter().map(|i| d(at(i))).collect();
    let mc: Vec<f32> = (0..h * w).into_par_iter().map(|i| m(at(i))).collect();
    let ce = if w == W { Edge::Wrap } else { Edge::Clamp };
    let e = residual(dc, mc, h, w, ce);
    for (i, v) in e.into_iter().enumerate() {
        out[at(i)] += v;
    }
}
