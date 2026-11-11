//! Plate-carree grid constants and the small per-pixel helpers every stage shares.
//! Images are row-major `Vec`s with explicit (h, w); longitude (columns) is periodic.
use rayon::prelude::*;

pub const W: usize = 8192;
pub const H: usize = 4096;

pub fn lat(row: usize) -> f64 {
    90.0 - (row as f64 + 0.5) * 180.0 / H as f64
}

pub fn lon(col: usize) -> f64 {
    -180.0 + (col as f64 + 0.5) * 360.0 / W as f64
}

pub fn smoothstep(e0: f32, e1: f32, x: f32) -> f32 {
    let t = ((x - e0) / (e1 - e0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

pub fn smoothstep64(e0: f64, e1: f64, x: f64) -> f64 {
    let t = ((x - e0) / (e1 - e0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// f x f block mean (numpy `x.reshape(h/f, f, w/f, f).mean((1, 3))`).
pub fn block_mean(x: &[f32], h: usize, w: usize, f: usize) -> Vec<f32> {
    let (bh, bw) = (h / f, w / f);
    let inv = 1.0 / (f * f) as f32;
    let mut out = vec![0f32; bh * bw];
    out.par_chunks_mut(bw).enumerate().for_each(|(by, o)| {
        for dy in 0..f {
            let row = &x[(by * f + dy) * w..(by * f + dy + 1) * w];
            for (bx, v) in o.iter_mut().enumerate() {
                *v += row[bx * f..bx * f + f].iter().sum::<f32>();
            }
        }
        o.iter_mut().for_each(|v| *v *= inv);
    });
    out
}

/// Fraction of true pixels per f x f block, thresholded `> 0.5` (numpy `block(m.astype(f32)) > 0.5`).
pub fn block_majority(m: &[bool], h: usize, w: usize, f: usize) -> Vec<bool> {
    let (bh, bw) = (h / f, w / f);
    let mut out = vec![false; bh * bw];
    out.par_chunks_mut(bw).enumerate().for_each(|(by, o)| {
        let mut cnt = vec![0u32; bw];
        for dy in 0..f {
            let row = &m[(by * f + dy) * w..(by * f + dy + 1) * w];
            for (bx, c) in cnt.iter_mut().enumerate() {
                *c += row[bx * f..bx * f + f].iter().filter(|&&b| b).count() as u32;
            }
        }
        for (v, c) in o.iter_mut().zip(cnt) {
            *v = c as f32 / (f * f) as f32 > 0.5;
        }
    });
    out
}

/// True where any pixel of the f x f block is true.
pub fn block_any(m: &[bool], h: usize, w: usize, f: usize) -> Vec<bool> {
    let (bh, bw) = (h / f, w / f);
    let mut out = vec![false; bh * bw];
    out.par_chunks_mut(bw).enumerate().for_each(|(by, o)| {
        for dy in 0..f {
            let row = &m[(by * f + dy) * w..(by * f + dy + 1) * w];
            for (bx, v) in o.iter_mut().enumerate() {
                *v |= row[bx * f..bx * f + f].iter().any(|&b| b);
            }
        }
    });
    out
}

/// Nearest upsample by f (numpy `np.repeat(np.repeat(x, f, 0), f, 1)`).
pub fn upsample<T: Copy + Send + Sync + Default>(x: &[T], h: usize, w: usize, f: usize) -> Vec<T> {
    let ow = w * f;
    let mut out = vec![T::default(); h * f * ow];
    out.par_chunks_mut(ow).enumerate().for_each(|(y, o)| {
        let src = &x[(y / f) * w..(y / f + 1) * w];
        for (x_, v) in o.iter_mut().enumerate() {
            *v = src[x_ / f];
        }
    });
    out
}

/// Every s-th row and column (numpy `x[::s, ::s]`).
pub fn subsample<T: Copy + Send + Sync>(x: &[T], h: usize, w: usize, s: usize) -> Vec<T> {
    let ow = w.div_ceil(s);
    (0..h.div_ceil(s))
        .into_par_iter()
        .flat_map_iter(|y| (0..ow).map(move |c| x[y * s * w + c * s]))
        .collect()
}

/// Minimal wrap-aware run of columns covering every true entry: (start, length) (geofill.py `arc`).
pub fn arc(occ: &[bool]) -> (usize, usize) {
    let n = occ.len();
    if occ.iter().all(|&b| b) {
        return (0, n);
    }
    let s = occ.iter().position(|&b| !b).unwrap();
    let idx: Vec<usize> = (0..n).filter(|&i| occ[(i + s) % n]).collect();
    let gaps: Vec<usize> = (0..idx.len())
        .map(|i| {
            if i + 1 < idx.len() {
                idx[i + 1] - idx[i]
            } else {
                idx[0] + n - idx[i]
            }
        })
        .collect();
    let g = gaps
        .iter()
        .enumerate()
        .fold(0, |b, (i, &v)| if v > gaps[b] { i } else { b });
    let start = idx[(g + 1) % idx.len()];
    let mut end = idx[g];
    if end < start {
        end += n;
    }
    ((start + s) % n, end - start + 1)
}
