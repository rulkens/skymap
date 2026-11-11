//! Connected components (scipy `label`, 4-connectivity, no wrap) on runs of a row-major mask, plus the
//! binary morphology geofill's cold-core fix uses (`binary_closing`, `binary_fill_holes`).
use rayon::prelude::*;

struct Runs {
    row: Vec<u32>,
    c0: Vec<u32>,
    c1: Vec<u32>, // exclusive
    root: Vec<u32>,
}

fn find(p: &mut [u32], mut i: u32) -> u32 {
    while p[i as usize] != i {
        p[i as usize] = p[p[i as usize] as usize];
        i = p[i as usize];
    }
    i
}

fn runs(m: &[bool], h: usize, w: usize) -> Runs {
    let per_row: Vec<Vec<(u32, u32)>> = (0..h)
        .into_par_iter()
        .map(|y| {
            let r = &m[y * w..(y + 1) * w];
            let mut out = Vec::new();
            let mut x = 0;
            while x < w {
                if r[x] {
                    let s = x;
                    while x < w && r[x] {
                        x += 1;
                    }
                    out.push((s as u32, x as u32));
                } else {
                    x += 1;
                }
            }
            out
        })
        .collect();
    let n: usize = per_row.iter().map(|v| v.len()).sum();
    let (mut row, mut c0, mut c1) = (
        Vec::with_capacity(n),
        Vec::with_capacity(n),
        Vec::with_capacity(n),
    );
    let mut start = Vec::with_capacity(h + 1);
    for (y, v) in per_row.iter().enumerate() {
        start.push(row.len());
        for &(a, b) in v {
            row.push(y as u32);
            c0.push(a);
            c1.push(b);
        }
    }
    start.push(row.len());
    let mut parent: Vec<u32> = (0..n as u32).collect();
    for y in 1..h {
        let (mut i, mut j) = (start[y - 1], start[y]);
        while i < start[y] && j < start[y + 1] {
            if c0[i] < c1[j] && c0[j] < c1[i] {
                let (a, b) = (find(&mut parent, i as u32), find(&mut parent, j as u32));
                if a != b {
                    parent[a.max(b) as usize] = a.min(b);
                }
            }
            if c1[i] < c1[j] {
                i += 1;
            } else {
                j += 1;
            }
        }
    }
    let root = (0..n as u32).map(|i| find(&mut parent, i)).collect();
    Runs { row, c0, c1, root }
}

/// True on mask pixels whose component has fewer than `max` pixels.
pub fn small_components(m: &[bool], h: usize, w: usize, max: usize) -> Vec<bool> {
    let r = runs(m, h, w);
    let mut size = vec![0usize; r.root.len()];
    for i in 0..r.root.len() {
        size[r.root[i] as usize] += (r.c1[i] - r.c0[i]) as usize;
    }
    let mut out = vec![false; h * w];
    for i in 0..r.root.len() {
        if size[r.root[i] as usize] < max {
            let o = r.row[i] as usize * w;
            out[o + r.c0[i] as usize..o + r.c1[i] as usize].fill(true);
        }
    }
    out
}

/// Number of components of a mask (for log lines).
pub fn count_components(m: &[bool], h: usize, w: usize) -> usize {
    let r = runs(m, h, w);
    (0..r.root.len())
        .filter(|&i| r.root[i] as usize == i)
        .count()
}

/// binary_fill_holes (default cross structure): background not 4-connected to the image border becomes true.
pub fn fill_holes(m: &[bool], h: usize, w: usize) -> Vec<bool> {
    let bg: Vec<bool> = m.par_iter().map(|&b| !b).collect();
    let r = runs(&bg, h, w);
    let mut border = vec![false; r.root.len()];
    for i in 0..r.root.len() {
        let y = r.row[i] as usize;
        if y == 0 || y == h - 1 || r.c0[i] == 0 || r.c1[i] as usize == w {
            border[r.root[i] as usize] = true;
        }
    }
    let mut out = m.to_vec();
    for i in 0..r.root.len() {
        if !border[r.root[i] as usize] {
            let o = r.row[i] as usize * w;
            out[o + r.c0[i] as usize..o + r.c1[i] as usize].fill(true);
        }
    }
    out
}

fn cross_step(m: &[bool], h: usize, w: usize, dilate: bool) -> Vec<bool> {
    // outside the image counts as false for both (scipy border_value=0)
    let at = |y: i64, x: i64| {
        y >= 0 && x >= 0 && (y as usize) < h && (x as usize) < w && m[y as usize * w + x as usize]
    };
    let mut out = vec![false; h * w];
    out.par_chunks_mut(w).enumerate().for_each(|(y, o)| {
        let y = y as i64;
        for (x, v) in o.iter_mut().enumerate() {
            let x = x as i64;
            let n = [
                at(y, x),
                at(y - 1, x),
                at(y + 1, x),
                at(y, x - 1),
                at(y, x + 1),
            ];
            *v = if dilate {
                n.iter().any(|&b| b)
            } else {
                n.iter().all(|&b| b)
            };
        }
    });
    out
}

/// binary_closing(m, iterations=it) with the default cross structure.
pub fn closing(m: &[bool], h: usize, w: usize, it: usize) -> Vec<bool> {
    let mut x = m.to_vec();
    for _ in 0..it {
        x = cross_step(&x, h, w, true);
    }
    for _ in 0..it {
        x = cross_step(&x, h, w, false);
    }
    x
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_components_and_holes() {
        // two blobs (3 px and 1 px) and a ring enclosing one hole pixel
        let s = ["##...#.", "#......", "...###.", "...#.#.", "...###."];
        let (h, w) = (s.len(), s[0].len());
        let m: Vec<bool> = s.iter().flat_map(|r| r.chars().map(|c| c == '#')).collect();
        let small = small_components(&m, h, w, 2);
        assert!(small[5] && !small[0] && !small[17]);
        assert_eq!(count_components(&m, h, w), 3);
        let f = fill_holes(&m, h, w);
        assert!(f[3 * w + 4] && !f[3 * w + 6]);
    }
}
