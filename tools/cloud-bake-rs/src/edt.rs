//! Exact Euclidean distance transform (Felzenszwalb & Huttenlocher), scipy `distance_transform_edt`
//! semantics: distance from each true pixel to the nearest false one, no wrap. Columns pass, then rows.
//! Squared column distances are integers <= 4096^2 = 2^24, so f32 holds them exactly.
use rayon::prelude::*;

const STRIP: usize = 32;

/// 1-D lower envelope of parabolas over f (inf = no feature); writes squared distances and arg indices.
fn envelope(f: &[f32], d: &mut [f32], arg: &mut [u32], v: &mut [usize], z: &mut [f64]) {
    let mut k = 0usize;
    let mut any = false;
    for q in 0..f.len() {
        if f[q].is_infinite() {
            continue;
        }
        if !any {
            any = true;
            v[0] = q;
            z[0] = f64::NEG_INFINITY;
            z[1] = f64::INFINITY;
            continue;
        }
        let fq = f[q] as f64 + (q * q) as f64;
        loop {
            let p = v[k];
            let s = (fq - (f[p] as f64 + (p * p) as f64)) / (2.0 * (q as f64 - p as f64));
            if s <= z[k] {
                k -= 1; // z[0] = -inf, so k never underflows
                continue;
            }
            k += 1;
            v[k] = q;
            z[k] = s;
            z[k + 1] = f64::INFINITY;
            break;
        }
    }
    if !any {
        d.iter_mut().for_each(|x| *x = f32::INFINITY);
        return;
    }
    let mut k = 0usize;
    for q in 0..f.len() {
        while z[k + 1] < q as f64 {
            k += 1;
        }
        let p = v[k];
        d[q] = ((q as f64 - p as f64).powi(2) + f[p] as f64) as f32;
        arg[q] = p as u32;
    }
}

/// Squared EDT; with `want_idx` also the nearest feature's (row, col).
fn edt_sq(m: &[bool], h: usize, w: usize, want_idx: bool) -> (Vec<f32>, Vec<u32>, Vec<u32>) {
    let strips: Vec<(Vec<f32>, Vec<u32>)> = (0..w.div_ceil(STRIP))
        .into_par_iter()
        .map(|s| {
            let (c0, c1) = (s * STRIP, ((s + 1) * STRIP).min(w));
            let mut d = vec![0f32; h * (c1 - c0)];
            let mut a = vec![0u32; if want_idx { h * (c1 - c0) } else { 0 }];
            let (mut f, mut dc, mut ac) = (vec![0f32; h], vec![0f32; h], vec![0u32; h]);
            let (mut v, mut z) = (vec![0usize; h], vec![0f64; h + 1]);
            for c in c0..c1 {
                for r in 0..h {
                    f[r] = if m[r * w + c] { f32::INFINITY } else { 0.0 };
                }
                envelope(&f, &mut dc, &mut ac, &mut v, &mut z);
                let j = (c - c0) * h;
                d[j..j + h].copy_from_slice(&dc);
                if want_idx {
                    a[j..j + h].copy_from_slice(&ac);
                }
            }
            (d, a)
        })
        .collect();
    let mut out = vec![0f32; h * w];
    let mut iy = vec![0u32; if want_idx { h * w } else { 0 }];
    let mut ix = vec![0u32; if want_idx { h * w } else { 0 }];
    let get = |r: usize, c: usize| {
        let (s, j) = (c / STRIP, c % STRIP);
        let a = if want_idx { strips[s].1[j * h + r] } else { 0 };
        (strips[s].0[j * h + r], a)
    };
    if want_idx {
        out.par_chunks_mut(w)
            .zip(iy.par_chunks_mut(w))
            .zip(ix.par_chunks_mut(w))
            .enumerate()
            .for_each(|(r, ((o, oy), ox))| {
                let (mut f, mut fa) = (vec![0f32; w], vec![0u32; w]);
                for c in 0..w {
                    (f[c], fa[c]) = get(r, c);
                }
                let (mut v, mut z, mut a) = (vec![0usize; w], vec![0f64; w + 1], vec![0u32; w]);
                envelope(&f, o, &mut a, &mut v, &mut z);
                for c in 0..w {
                    ox[c] = a[c];
                    oy[c] = fa[a[c] as usize];
                }
            });
    } else {
        out.par_chunks_mut(w).enumerate().for_each(|(r, o)| {
            let mut f = vec![0f32; w];
            for c in 0..w {
                f[c] = get(r, c).0;
            }
            let (mut v, mut z, mut a) = (vec![0usize; w], vec![0f64; w + 1], vec![0u32; w]);
            envelope(&f, o, &mut a, &mut v, &mut z);
        });
    }
    (out, iy, ix)
}

/// Distance to the nearest false pixel. With no false pixel at all scipy measures from (-1, 0) — a quirk
/// the bake hits (hybridise on an orbit with no overlap) — reproduced with `row0` = the band's first row.
pub fn edt(m: &[bool], h: usize, w: usize, row0: usize) -> Vec<f32> {
    if m.par_iter().all(|&b| b) {
        return (0..h * w)
            .into_par_iter()
            .map(|i| {
                ((((i / w + row0 + 1) as f64).powi(2) + ((i % w) as f64).powi(2)).sqrt()) as f32
            })
            .collect();
    }
    let (mut d, _, _) = edt_sq(m, h, w, false);
    d.par_iter_mut().for_each(|v| *v = v.sqrt());
    d
}

/// Nearest false pixel's (row, col) for every pixel (scipy `return_indices=True`; ties may break differently).
pub fn nearest_feature(m: &[bool], h: usize, w: usize) -> (Vec<u32>, Vec<u32>) {
    let (_, iy, ix) = edt_sq(m, h, w, true);
    (iy, ix)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_brute_force() {
        let (h, w) = (13, 71);
        let m: Vec<bool> = (0..h * w).map(|i| (i * 7919 % 23) != 0).collect();
        let d = edt(&m, h, w, 0);
        let (iy, ix) = nearest_feature(&m, h, w);
        for p in 0..h * w {
            let dist = |q: usize| {
                (((p / w) as f64 - (q / w) as f64).powi(2)
                    + ((p % w) as f64 - (q % w) as f64).powi(2))
                .sqrt()
            };
            let best = (0..h * w)
                .filter(|&q| !m[q])
                .map(dist)
                .fold(f64::INFINITY, f64::min);
            assert!(
                (d[p] as f64 - best).abs() < 1e-5,
                "px {p}: {} vs {best}",
                d[p]
            );
            let q = iy[p] as usize * w + ix[p] as usize;
            assert!(!m[q] && (dist(q) - best).abs() < 1e-9);
        }
    }
}
