//! Boykov–Kolmogorov max-flow on an implicit 4-connected h x w grid whose columns wrap (the date line),
//! as PyMaxflow's Graph[float] runs it for seam_viirs.py `cut`. No maintained Rust crate does grid BK
//! (crates.io has only generic Dinic/ISAP/push-relabel). The label it returns, "can reach the sink in
//! the residual graph", is the unique minimal sink side of the min cut, so it is algorithm-independent.
use std::collections::VecDeque;

const R: u8 = 0;
const L: u8 = 1;
const D: u8 = 2;
const U: u8 = 3;
const TERMINAL: u8 = 4;
const ORPHAN: u8 = 5;
const NONE: u8 = 6;

pub struct Grid {
    h: usize,
    w: usize,
    cap: Vec<f64>, // residual capacity of arc (p, dir), index p * 4 + dir
    tr: Vec<f64>,  // > 0: residual source -> p, < 0: residual p -> sink
    parent: Vec<u8>,
    sink: Vec<bool>,
    ts: Vec<u32>,
    dist: Vec<u32>,
    active: Vec<bool>,
    queue: VecDeque<u32>,
    orphans: VecDeque<u32>,
    time: u32,
    pub flow: f64,
}

impl Grid {
    /// `right[p]`: capacity both ways between p and its right neighbour (column w-1 wraps to 0);
    /// `down[p]`: between p and the pixel below (last row unused); `src`/`snk`: terminal capacities.
    pub fn new(h: usize, w: usize, right: &[f64], down: &[f64], src: &[f64], snk: &[f64]) -> Grid {
        let n = h * w;
        let mut cap = vec![0f64; n * 4];
        let mut tr = vec![0f64; n];
        let mut flow = 0.0;
        for p in 0..n {
            let (r, c) = (p / w, p % w);
            cap[p * 4 + R as usize] = right[p];
            cap[p * 4 + L as usize] = right[r * w + (c + w - 1) % w];
            if r + 1 < h {
                cap[p * 4 + D as usize] = down[p];
            }
            if r > 0 {
                cap[p * 4 + U as usize] = down[p - w];
            }
            // Graph::add_tweights: both terminal arcs lose their common part, which is flow already
            flow += src[p].min(snk[p]);
            tr[p] = src[p] - snk[p];
        }
        Grid {
            h,
            w,
            cap,
            tr,
            parent: vec![NONE; n],
            sink: vec![false; n],
            ts: vec![0; n],
            dist: vec![0; n],
            active: vec![false; n],
            queue: VecDeque::new(),
            orphans: VecDeque::new(),
            time: 0,
            flow,
        }
    }

    fn head(&self, p: usize, d: u8) -> usize {
        let (r, c, w) = (p / self.w, p % self.w, self.w);
        match d {
            R => r * w + (c + 1) % w,
            L => r * w + (c + w - 1) % w,
            D => p + w,
            _ => p - w,
        }
    }

    /// The arcs that exist at p (no D on the last row, no U on the first), without allocating.
    fn arcs(&self, p: usize) -> ([u8; 4], usize) {
        let r = p / self.w;
        let mut out = [R, L, 0, 0];
        let mut n = 2;
        if r + 1 < self.h {
            out[n] = D;
            n += 1;
        }
        if r > 0 {
            out[n] = U;
            n += 1;
        }
        (out, n)
    }

    fn sister(d: u8) -> u8 {
        d ^ 1
    }

    fn set_active(&mut self, p: usize) {
        if !self.active[p] {
            self.active[p] = true;
            self.queue.push_back(p as u32);
        }
    }

    fn next_active(&mut self) -> Option<usize> {
        while let Some(p) = self.queue.pop_front() {
            let p = p as usize;
            self.active[p] = false;
            if self.parent[p] != NONE {
                return Some(p);
            }
        }
        None
    }

    fn set_orphan_front(&mut self, p: usize) {
        self.parent[p] = ORPHAN;
        self.orphans.push_front(p as u32);
    }

    fn set_orphan_rear(&mut self, p: usize) {
        self.parent[p] = ORPHAN;
        self.orphans.push_back(p as u32);
    }

    fn augment(&mut self, mid_p: usize, mid_d: u8) {
        let mid_q = self.head(mid_p, mid_d);
        let mut b = self.cap[mid_p * 4 + mid_d as usize];
        let mut i = mid_p;
        loop {
            let a = self.parent[i];
            if a == TERMINAL {
                break;
            }
            let j = self.head(i, a);
            b = b.min(self.cap[j * 4 + Self::sister(a) as usize]);
            i = j;
        }
        b = b.min(self.tr[i]);
        let mut i = mid_q;
        loop {
            let a = self.parent[i];
            if a == TERMINAL {
                break;
            }
            b = b.min(self.cap[i * 4 + a as usize]);
            i = self.head(i, a);
        }
        b = b.min(-self.tr[i]);

        self.cap[mid_q * 4 + Self::sister(mid_d) as usize] += b;
        self.cap[mid_p * 4 + mid_d as usize] -= b;
        let mut i = mid_p;
        loop {
            let a = self.parent[i];
            if a == TERMINAL {
                break;
            }
            let j = self.head(i, a);
            self.cap[i * 4 + a as usize] += b;
            let s = j * 4 + Self::sister(a) as usize;
            self.cap[s] -= b;
            if self.cap[s] == 0.0 {
                self.set_orphan_front(i);
            }
            i = j;
        }
        self.tr[i] -= b;
        if self.tr[i] == 0.0 {
            self.set_orphan_front(i);
        }
        let mut i = mid_q;
        loop {
            let a = self.parent[i];
            if a == TERMINAL {
                break;
            }
            let j = self.head(i, a);
            self.cap[j * 4 + Self::sister(a) as usize] += b;
            self.cap[i * 4 + a as usize] -= b;
            if self.cap[i * 4 + a as usize] == 0.0 {
                self.set_orphan_front(i);
            }
            i = j;
        }
        self.tr[i] += b;
        if self.tr[i] == 0.0 {
            self.set_orphan_front(i);
        }
        self.flow += b;
    }

    /// Steps from j to its tree's terminal (or ORPHAN), using and refreshing the TS/DIST marks.
    fn origin_dist(&mut self, j: usize) -> Option<u32> {
        let mut d = 0u32;
        let mut jj = j;
        loop {
            if self.ts[jj] == self.time {
                d += self.dist[jj];
                break;
            }
            let a = self.parent[jj];
            d += 1;
            if a == TERMINAL {
                self.ts[jj] = self.time;
                self.dist[jj] = 1;
                break;
            }
            if a == ORPHAN {
                return None;
            }
            jj = self.head(jj, a);
        }
        let mut jj = j;
        let mut d2 = d;
        while self.ts[jj] != self.time {
            self.ts[jj] = self.time;
            self.dist[jj] = d2;
            d2 -= 1;
            let a = self.parent[jj];
            jj = self.head(jj, a);
        }
        Some(d)
    }

    fn process_orphan(&mut self, i: usize) {
        let is_sink = self.sink[i];
        let mut best: Option<(u8, u32)> = None;
        let (arr, na) = self.arcs(i);
        let arcs = &arr[..na];
        for &a0 in arcs {
            let j = self.head(i, a0);
            // source tree: parent j -> i must have residual; sink tree: i -> j
            let rc = if is_sink {
                self.cap[i * 4 + a0 as usize]
            } else {
                self.cap[j * 4 + Self::sister(a0) as usize]
            };
            if rc == 0.0 || self.sink[j] != is_sink || self.parent[j] == NONE {
                continue;
            }
            if let Some(d) = self.origin_dist(j) {
                if best.is_none_or(|(_, bd)| d < bd) {
                    best = Some((a0, d));
                }
            }
        }
        if let Some((a0, d)) = best {
            self.parent[i] = a0;
            self.ts[i] = self.time;
            self.dist[i] = d + 1;
            return;
        }
        for &a0 in arcs {
            let j = self.head(i, a0);
            if self.sink[j] != is_sink || self.parent[j] == NONE {
                continue;
            }
            let rc = if is_sink {
                self.cap[i * 4 + a0 as usize]
            } else {
                self.cap[j * 4 + Self::sister(a0) as usize]
            };
            if rc > 0.0 {
                self.set_active(j);
            }
            let a = self.parent[j];
            if a != TERMINAL && a != ORPHAN && self.head(j, a) == i {
                self.set_orphan_rear(j);
            }
        }
        self.parent[i] = NONE;
    }

    pub fn maxflow(&mut self) -> f64 {
        for p in 0..self.h * self.w {
            if self.tr[p] != 0.0 {
                self.sink[p] = self.tr[p] < 0.0;
                self.parent[p] = TERMINAL;
                self.dist[p] = 1;
                self.set_active(p);
            }
        }
        let mut current: Option<usize> = None;
        loop {
            let mut i = current.take();
            if let Some(p) = i {
                self.active[p] = false;
                if self.parent[p] == NONE {
                    i = None;
                }
            }
            let i = match i.or_else(|| self.next_active()) {
                Some(p) => p,
                None => break,
            };
            let mut found: Option<(usize, u8)> = None;
            let (arr, na) = self.arcs(i);
            let arcs = &arr[..na];
            if !self.sink[i] {
                for &a in arcs {
                    if self.cap[i * 4 + a as usize] == 0.0 {
                        continue;
                    }
                    let j = self.head(i, a);
                    if self.parent[j] == NONE {
                        self.sink[j] = false;
                        self.parent[j] = Self::sister(a);
                        self.ts[j] = self.ts[i];
                        self.dist[j] = self.dist[i] + 1;
                        self.set_active(j);
                    } else if self.sink[j] {
                        found = Some((i, a));
                        break;
                    } else if self.ts[j] <= self.ts[i] && self.dist[j] > self.dist[i] {
                        self.parent[j] = Self::sister(a);
                        self.ts[j] = self.ts[i];
                        self.dist[j] = self.dist[i] + 1;
                    }
                }
            } else {
                for &a in arcs {
                    let j = self.head(i, a);
                    if self.cap[j * 4 + Self::sister(a) as usize] == 0.0 {
                        continue;
                    }
                    if self.parent[j] == NONE {
                        self.sink[j] = true;
                        self.parent[j] = Self::sister(a);
                        self.ts[j] = self.ts[i];
                        self.dist[j] = self.dist[i] + 1;
                        self.set_active(j);
                    } else if !self.sink[j] {
                        found = Some((j, Self::sister(a)));
                        break;
                    } else if self.ts[j] <= self.ts[i] && self.dist[j] > self.dist[i] {
                        self.parent[j] = Self::sister(a);
                        self.ts[j] = self.ts[i];
                        self.dist[j] = self.dist[i] + 1;
                    }
                }
            }
            self.time += 1;
            if let Some((p, a)) = found {
                self.active[i] = true; // stays current: keeps it out of the queue
                current = Some(i);
                self.augment(p, a);
                while let Some(o) = self.orphans.pop_front() {
                    self.process_orphan(o as usize);
                }
            }
        }
        self.flow
    }

    /// PyMaxflow get_grid_segments: true = sink segment (free nodes default to the source).
    pub fn segments(&self) -> Vec<bool> {
        (0..self.h * self.w)
            .map(|p| self.parent[p] != NONE && self.sink[p])
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lcg(s: &mut u64) -> f64 {
        *s = s
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        (*s >> 33) as f64 / (1u64 << 31) as f64
    }

    /// Every labeling of a 3x4 wrapped grid: the min cut's value, and its minimal sink side (the
    /// intersection of all optimal sink sides) must equal BK's flow and segments.
    #[test]
    fn matches_brute_force_min_cut() {
        let (h, w) = (3usize, 4usize);
        let n = h * w;
        let mut seed = 7u64;
        for _ in 0..40 {
            let mut v = |p: f64| {
                if lcg(&mut seed) < p {
                    0.0
                } else {
                    (lcg(&mut seed) * 4.0).round() / 2.0
                }
            };
            let right: Vec<f64> = (0..n).map(|_| v(0.2)).collect();
            let down: Vec<f64> = (0..n)
                .map(|i| if i / w == h - 1 { 0.0 } else { v(0.2) })
                .collect();
            let src: Vec<f64> = (0..n).map(|_| v(0.5)).collect();
            let snk: Vec<f64> = (0..n).map(|_| v(0.5)).collect();
            let mut g = Grid::new(h, w, &right, &down, &src, &snk);
            let flow = g.maxflow();
            let seg = g.segments();
            let cost = |s: u32| {
                let t = |p: usize| s >> p & 1 == 1;
                let mut c = 0.0;
                for p in 0..n {
                    c += if t(p) { src[p] } else { snk[p] };
                    let (r, col) = (p / w, p % w);
                    let q = r * w + (col + 1) % w;
                    if t(p) != t(q) {
                        c += right[p];
                    }
                    if r + 1 < h && t(p) != t(p + w) {
                        c += down[p];
                    }
                }
                c
            };
            let best = (0..1u32 << n).map(cost).fold(f64::INFINITY, f64::min);
            assert!((flow - best).abs() < 1e-9, "flow {flow} vs min cut {best}");
            let minimal = (0..1u32 << n)
                .filter(|&s| (cost(s) - best).abs() < 1e-9)
                .fold(u32::MAX, |a, s| a & s);
            for p in 0..n {
                assert_eq!(seg[p], minimal >> p & 1 == 1, "node {p}");
            }
        }
    }
}
