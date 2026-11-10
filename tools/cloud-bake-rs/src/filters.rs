//! scipy.ndimage filters as the Python bake calls them: rows clamp ('nearest'), columns wrap unless a call
//! says otherwise. Separable passes run axis 0 then axis 1, like scipy; kernels truncate at int(4 sigma + 0.5).
use rayon::prelude::*;

#[derive(Clone, Copy, PartialEq)]
pub enum Edge {
    Clamp,
    Wrap,
}

pub fn gauss_kernel(sigma: f64) -> Vec<f32> {
    let r = (4.0 * sigma + 0.5) as i64;
    let k: Vec<f64> = (-r..=r)
        .map(|x| (-0.5 / (sigma * sigma) * (x * x) as f64).exp())
        .collect();
    let s: f64 = k.iter().sum();
    k.iter().map(|v| (v / s) as f32).collect()
}

pub(crate) fn idx(i: i64, n: usize, e: Edge) -> usize {
    match e {
        Edge::Clamp => i.clamp(0, n as i64 - 1) as usize,
        Edge::Wrap => i.rem_euclid(n as i64) as usize,
    }
}

/// Correlate along axis 0 (rows) with weights `k` centred at k.len()/2.
pub fn corr_rows(x: &[f32], h: usize, w: usize, k: &[f32], e: Edge) -> Vec<f32> {
    let r = (k.len() / 2) as i64;
    let mut out = vec![0f32; h * w];
    out.par_chunks_mut(w).enumerate().for_each(|(y, o)| {
        for (j, &kj) in k.iter().enumerate() {
            if kj == 0.0 {
                continue;
            }
            let sy = idx(y as i64 + j as i64 - r, h, e);
            for (v, s) in o.iter_mut().zip(&x[sy * w..(sy + 1) * w]) {
                *v += kj * s;
            }
        }
    });
    out
}

/// Correlate along axis 1 (columns).
pub fn corr_cols(x: &[f32], h: usize, w: usize, k: &[f32], e: Edge) -> Vec<f32> {
    let r = k.len() / 2;
    let mut out = vec![0f32; h * w];
    out.par_chunks_mut(w).enumerate().for_each(|(y, o)| {
        let row = &x[y * w..(y + 1) * w];
        let pad: Vec<f32> = (0..w + 2 * r)
            .map(|i| row[idx(i as i64 - r as i64, w, e)])
            .collect();
        for (j, &kj) in k.iter().enumerate() {
            if kj == 0.0 {
                continue;
            }
            for (v, s) in o.iter_mut().zip(&pad[j..j + w]) {
                *v += kj * s;
            }
        }
    });
    out
}

/// gaussian_filter(x, sigma, mode=(rows, cols)).
pub fn gaussian(x: &[f32], h: usize, w: usize, sigma: f64, rows: Edge, cols: Edge) -> Vec<f32> {
    let k = gauss_kernel(sigma);
    corr_cols(&corr_rows(x, h, w, &k, rows), h, w, &k, cols)
}

/// gaussian_filter(x, sigma, mode=('nearest', 'wrap')) — the bake's WRAP.
pub fn gaussian_wrap(x: &[f32], h: usize, w: usize, sigma: f64) -> Vec<f32> {
    gaussian(x, h, w, sigma, Edge::Clamp, Edge::Wrap)
}

/// hypot(sobel(x, 0), sobel(x, 1)) / 8 with mode WRAP (seam_viirs.py edge_weights `grad`).
pub fn sobel_grad(x: &[f32], h: usize, w: usize) -> Vec<f32> {
    let d = [-1.0f32, 0.0, 1.0];
    let s = [1.0f32, 2.0, 1.0];
    let g0 = corr_cols(&corr_rows(x, h, w, &d, Edge::Clamp), h, w, &s, Edge::Wrap);
    let g1 = corr_cols(&corr_rows(x, h, w, &s, Edge::Clamp), h, w, &d, Edge::Wrap);
    g0.par_iter()
        .zip(&g1)
        .map(|(a, b)| a.hypot(*b) / 8.0)
        .collect()
}

/// 3x3 maximum_filter, mode WRAP.
pub fn max3_wrap(x: &[f32], h: usize, w: usize) -> Vec<f32> {
    let mut v = vec![0f32; h * w];
    v.par_chunks_mut(w).enumerate().for_each(|(y, o)| {
        let a = &x[y.saturating_sub(1) * w..][..w];
        let b = &x[y * w..][..w];
        let c = &x[(y + 1).min(h - 1) * w..][..w];
        for i in 0..w {
            o[i] = a[i].max(b[i]).max(c[i]);
        }
    });
    let mut out = vec![0f32; h * w];
    out.par_chunks_mut(w).enumerate().for_each(|(y, o)| {
        let r = &v[y * w..(y + 1) * w];
        for i in 0..w {
            o[i] = r[(i + w - 1) % w].max(r[i]).max(r[(i + 1) % w]);
        }
    });
    out
}

/// 3x3 median of a u8 image, mode 'nearest' on both axes (geofill median_filter / bake.py median3).
pub fn median3_u8(x: &[u8], h: usize, w: usize) -> Vec<u8> {
    let mut out = vec![0u8; h * w];
    out.par_chunks_mut(w).enumerate().for_each(|(y, o)| {
        let rows = [y.saturating_sub(1), y, (y + 1).min(h - 1)].map(|r| &x[r * w..(r + 1) * w]);
        for i in 0..w {
            let cs = [i.saturating_sub(1), i, (i + 1).min(w - 1)];
            let mut v = [0u8; 9];
            for (a, r) in rows.iter().enumerate() {
                for (b, &c) in cs.iter().enumerate() {
                    v[a * 3 + b] = r[c];
                }
            }
            v.sort_unstable();
            o[i] = v[4];
        }
    });
    out
}

/// bake.py `dilate(m, k)`: (2k+1)^2 square dilation by np.roll, so BOTH axes wrap. For a row band of a
/// taller image, `outside` is the value of the rows beyond the band (the band is not periodic on its own).
pub fn dilate_roll(
    m: &[bool],
    h: usize,
    w: usize,
    k: usize,
    full_height: bool,
    outside: bool,
) -> Vec<bool> {
    let mut v = vec![false; h * w];
    v.par_chunks_mut(w).enumerate().for_each(|(y, o)| {
        o.copy_from_slice(&m[y * w..(y + 1) * w]);
        for s in 1..=k as i64 {
            for yy in [y as i64 - s, y as i64 + s] {
                if full_height || (0..h as i64).contains(&yy) {
                    let r = yy.rem_euclid(h as i64) as usize;
                    o.iter_mut()
                        .zip(&m[r * w..(r + 1) * w])
                        .for_each(|(a, b)| *a |= *b);
                } else if outside {
                    o.iter_mut().for_each(|a| *a = true);
                }
            }
        }
    });
    let mut out = vec![false; h * w];
    out.par_chunks_mut(w).enumerate().for_each(|(y, o)| {
        let r = &v[y * w..(y + 1) * w];
        for i in 0..w {
            o[i] = (0..=2 * k).any(|d| r[(i + w + d - k) % w]);
        }
    });
    out
}
