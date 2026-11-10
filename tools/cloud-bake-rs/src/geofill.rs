//! Time-matched geostationary IR fill for the composite's gaps (geofill.py): every time cell the fill
//! touches gets the UTC time it was observed (orbit model; mosaic cells picked by correlating against geo
//! IR when two passes compete), gaps take the time of their nearest observed pixel, times quantise to
//! 10-min slots that cross-fade over ~1 deg, and each slot's frames map to opacity as bake.py ir() does.
use crate::date::Date;
use crate::edt::nearest_feature;
use crate::fetch::{self, FrameReq};
use crate::filters::{gaussian, median3_u8, Edge};
use crate::geodecode::{lon_in, view_angle, Decoder};
use crate::grid::{arc, block_any, lon, subsample, H, W};
use crate::orbit::{Orbit, HALF_SWATH, P};
use crate::sources::Swath;
use crate::sources_table::geo;
use rayon::prelude::*;
use std::path::Path;

const CELL: usize = 64;
const HC: usize = H / CELL;
const WC: usize = W / CELL;
const Q: usize = 4;
const SLOT: f64 = 10.0;
const SLOT_SIGMA: f64 = 6.0;
const CORE_PAD: usize = 96;
const FILL_PAD: usize = 48;

type Cands = Vec<(f64, f64)>; // (UTC minute, cross-track angle), best first

fn slot_of(t: f64) -> i32 {
    ((t / SLOT).round_ties_even() * SLOT).clamp(0.0, 1440.0 - SLOT) as i32
}

/// Per satellite, the time cells it can contribute to (view angle < 78 deg, longitude window + 1 cell).
fn satc() -> Vec<Vec<bool>> {
    geo()
        .map(|s| s.view())
        .map(|k| {
            let inwin: Vec<bool> = (0..WC)
                .map(|c| lon_in(k, lon(c * CELL + CELL / 2)))
                .collect();
            let near: Vec<bool> = (0..WC)
                .map(|c| inwin[(c + WC - 1) % WC] || inwin[c] || inwin[(c + 1) % WC])
                .collect();
            (0..HC * WC)
                .map(|i| {
                    view_angle(k, (i / WC) * CELL + CELL / 2, (i % WC) * CELL + CELL / 2) < 78.0
                        && near[i % WC]
                })
                .collect()
        })
        .collect()
}

/// 8-connected groups of a cell mask in scipy label order, joined across the date line per row.
fn groups(m: &[bool]) -> Vec<Vec<bool>> {
    let mut lab = vec![0usize; HC * WC];
    let mut n = 0;
    for s in 0..HC * WC {
        if !m[s] || lab[s] != 0 {
            continue;
        }
        n += 1;
        let mut stack = vec![s];
        lab[s] = n;
        while let Some(p) = stack.pop() {
            let (r, c) = ((p / WC) as i64, (p % WC) as i64);
            for dr in -1..=1 {
                for dc in -1..=1 {
                    let (rr, cc) = (r + dr, c + dc);
                    if rr < 0 || cc < 0 || rr >= HC as i64 || cc >= WC as i64 {
                        continue;
                    }
                    let q = rr as usize * WC + cc as usize;
                    if m[q] && lab[q] == 0 {
                        lab[q] = n;
                        stack.push(q);
                    }
                }
            }
        }
    }
    for r in 0..HC {
        let (a, b) = (lab[r * WC], lab[r * WC + WC - 1]);
        if a != 0 && b != 0 && a != b {
            lab.iter_mut().filter(|l| **l == b).for_each(|l| *l = a);
        }
    }
    let mut ids: Vec<usize> = lab.iter().copied().filter(|&l| l > 0).collect();
    ids.sort();
    ids.dedup();
    ids.iter()
        .map(|&k| lab.iter().map(|&l| l == k).collect())
        .collect()
}

/// One request per (slot, connected cell group, satellite), padded by `pad` px.
fn plan(
    slot_masks: &[(i32, Vec<bool>)],
    pad: usize,
    satc: &[Vec<bool>],
    scale: usize,
    date: Date,
) -> Vec<FrameReq> {
    let mut jobs = Vec::new();
    for (slot, m) in slot_masks {
        for g in groups(m) {
            for (ki, k) in geo().map(|s| s.id).enumerate() {
                let mk: Vec<bool> = (0..HC * WC).map(|i| g[i] && satc[ki][i]).collect();
                if !mk.iter().any(|&b| b) {
                    continue;
                }
                let rr: Vec<usize> = (0..HC)
                    .filter(|&r| mk[r * WC..(r + 1) * WC].iter().any(|&b| b))
                    .collect();
                let occ: Vec<bool> = (0..WC).map(|c| (0..HC).any(|r| mk[r * WC + c])).collect();
                let (c0, n) = arc(&occ);
                let r0 = (rr[0] * CELL).saturating_sub(pad);
                let r1 = ((rr[rr.len() - 1] + 1) * CELL + pad).min(H);
                let len = n * CELL + 2 * pad;
                let (x0, len) = if len > W {
                    (0, W)
                } else {
                    (((c0 * CELL + W) - pad) % W, len)
                };
                jobs.push(FrameReq {
                    sat: k,
                    date,
                    tmin: *slot,
                    x0,
                    x1: x0 + len,
                    y0: r0,
                    y1: r1,
                    scale,
                });
            }
        }
    }
    jobs
}

fn passes(orb: &Orbit, phase: f64) -> Vec<(f64, f64)> {
    let t_node0 = orb.tn - phase * P;
    (-3..18)
        .filter_map(|n| {
            let tn = t_node0 + n as f64 * P;
            let (t0, t1) = ((tn - P / 4.0).max(0.0), (tn + P / 4.0).min(1440.0));
            (t1 > t0).then_some((t0, t1))
        })
        .collect()
}

/// Per time cell: candidate passes from the cell's majority source, nearest nadir first.
fn cell_times(labels: &[i8], swaths: &[Swath], need: &[bool], orb: &Orbit) -> Vec<Option<Cands>> {
    let counts: Vec<Vec<u32>> = (0..HC * WC)
        .into_par_iter()
        .map(|cell| {
            let (r, c) = (cell / WC, cell % WC);
            let mut n = vec![0u32; swaths.len()];
            for y in r * CELL..(r + 1) * CELL {
                for &l in &labels[y * W + c * CELL..y * W + (c + 1) * CELL] {
                    if l >= 0 {
                        n[l as usize] += 1;
                    }
                }
            }
            n
        })
        .collect();
    let idx: Vec<usize> = (0..HC * WC).filter(|&i| need[i]).collect();
    let pts: Vec<(f64, f64)> = idx
        .iter()
        .map(|&i| {
            (
                90.0 - ((i / WC) as f64 + 0.5) * 180.0 / HC as f64,
                -180.0 + ((i % WC) as f64 + 0.5) * 360.0 / WC as f64,
            )
        })
        .collect();
    let cand: Vec<Vec<Vec<(f64, f64)>>> = [0.0, 0.5]
        .iter()
        .map(|&ph| {
            passes(orb, ph)
                .iter()
                .map(|&(t0, t1)| orb.pass_time(&pts, ph, t0, t1, 0.1))
                .collect()
        })
        .collect();
    let mut out = vec![None; HC * WC];
    for (j, &cell) in idx.iter().enumerate() {
        let n = &counts[cell];
        if n.iter().sum::<u32>() == 0 {
            continue;
        }
        let k = n
            .iter()
            .enumerate()
            .fold(0, |b, (i, &v)| if v > n[b] { i } else { b });
        let sw = &swaths[k];
        let tsds: Vec<(f64, f64)> = cand[sw.phase].iter().map(|p| p[j]).collect();
        if let Some((lo, hi)) = sw.window {
            let best = tsds.iter().filter(|(t, _)| *t >= lo && *t <= hi).fold(
                None,
                |b: Option<(f64, f64)>, &x| match b {
                    Some(bb) if bb.1 <= x.1 => Some(bb),
                    _ => Some(x),
                },
            );
            if let Some(b) = best {
                out[cell] = Some(vec![b]);
                continue;
            }
        }
        let mut order: Vec<usize> = (0..tsds.len()).collect();
        order.sort_by(|&a, &b| tsds[a].1.total_cmp(&tsds[b].1));
        let cs: Cands = order
            .iter()
            .filter(|&&i| tsds[i].1 < HALF_SWATH * 1.05)
            .map(|&i| tsds[i])
            .collect();
        out[cell] = Some(if cs.is_empty() {
            vec![tsds[order[0]]]
        } else {
            cs
        });
    }
    out
}

/// Sparse quarter-res slot weight: rows [r0, r0+h), columns (c0 + j) % (W/Q).
struct Sparse {
    r0: usize,
    h: usize,
    c0: usize,
    w: usize,
    v: Vec<f32>,
}

impl Sparse {
    fn get(&self, r: usize, c: usize) -> f32 {
        let wq = W / Q;
        let (dr, dc) = (r.wrapping_sub(self.r0), (c + wq - self.c0) % wq);
        if dr < self.h && dc < self.w {
            self.v[dr * self.w + dc]
        } else {
            0.0
        }
    }
}

/// gaussian_filter(indicator, SLOT_SIGMA, mode=('nearest','wrap')) evaluated only where it can be non-zero.
fn slot_weight(ind: &[bool]) -> Sparse {
    let (hq, wq) = (H / Q, W / Q);
    let rad = (4.0 * SLOT_SIGMA + 0.5) as usize;
    let rows: Vec<usize> = (0..hq)
        .filter(|&r| ind[r * wq..(r + 1) * wq].iter().any(|&b| b))
        .collect();
    let occ: Vec<bool> = (0..wq)
        .into_par_iter()
        .map(|c| rows.iter().any(|&r| ind[r * wq + c]))
        .collect();
    let (c0, n) = arc(&occ);
    let r0 = rows[0].saturating_sub(rad);
    let r1 = (rows[rows.len() - 1] + 1 + rad).min(hq);
    let (c0, w, ce) = if n + 2 * rad >= wq {
        (0, wq, Edge::Wrap)
    } else {
        ((c0 + wq - rad) % wq, n + 2 * rad, Edge::Clamp)
    };
    let h = r1 - r0;
    let crop: Vec<f32> = (0..h * w)
        .map(|i| ind[(r0 + i / w) * wq + (c0 + i % w) % wq] as u8 as f32)
        .collect();
    // rows: the crop starts `rad` zero rows from the support unless it reaches the grid edge, where
    // clamping is the grid's own boundary rule; columns likewise
    let v = gaussian(&crop, h, w, SLOT_SIGMA, Edge::Clamp, ce);
    Sparse { r0, h, c0, w, v }
}

struct Acc {
    ww: usize,
    acc: Vec<f32>,
    wsum: Vec<f32>,
    cov: Vec<f32>,
    cmax: Vec<f32>,
}

impl Acc {
    fn new(hh: usize, ww: usize) -> Acc {
        let z = || vec![0f32; hh * ww];
        Acc {
            ww,
            acc: z(),
            wsum: z(),
            cov: z(),
            cmax: z(),
        }
    }
}

/// Target index in an accumulator for pixel (i, j) of a job's layer.
fn target(r: &FrameReq, i: usize, j: usize, ww: usize) -> usize {
    let s = r.scale;
    ((r.y0 + i * s) / s) * ww + ((r.x0 + j * s) % W) / s
}

/// Calls `f(accumulator index, slot weight, layer index)` for each pixel of a job's layer.
fn visit(
    jb: &FrameReq,
    ww: usize,
    weights: Option<&[(i32, Sparse)]>,
    mut f: impl FnMut(usize, f32, usize),
) {
    let (h, w) = ((jb.y1 - jb.y0) / jb.scale, (jb.x1 - jb.x0) / jb.scale);
    let sp = weights.map(|ws| &ws.iter().find(|(s, _)| *s == jb.tmin).unwrap().1);
    for i in 0..h {
        for j in 0..w {
            let wv = sp.map_or(1.0, |s| s.get((jb.y0 + i) / Q, ((jb.x0 + j) % W) / Q));
            f(target(jb, i, j, ww), wv, i * w + j);
        }
    }
}

/// geofill.py accumulate over consecutive jobs (grouped by slot): layers decode in parallel batches,
/// each slot's coverage is the max over its satellites, weighted once.
fn accumulate(
    jobs: &[FrameReq],
    dec: &Decoder,
    frames: &Path,
    a: &mut Acc,
    weights: Option<&[(i32, Sparse)]>,
    mut on_slot: impl FnMut(i32, &mut Acc, &[FrameReq]),
) {
    let batch = (rayon::current_num_threads() * 2).max(4);
    let mut pending: Vec<FrameReq> = Vec::new();
    let flush = |pending: &mut Vec<FrameReq>,
                 a: &mut Acc,
                 on_slot: &mut dyn FnMut(i32, &mut Acc, &[FrameReq])| {
        let ww = a.ww;
        for jb in pending.iter() {
            visit(jb, ww, weights, |t, wv, _| {
                a.cov[t] += wv * a.cmax[t];
                a.cmax[t] = 0.0;
            });
        }
        if let Some(s) = pending.first().map(|j| j.tmin) {
            on_slot(s, a, pending);
        }
        pending.clear();
    };
    for chunk in jobs.chunks(batch) {
        let layers: Vec<_> = chunk
            .par_iter()
            .map(|jb| fetch::frame(frames, jb).map(|f| dec.layer(jb, f)))
            .collect();
        for (jb, layer) in chunk.iter().zip(layers) {
            // a missing or broken frame contributes nothing, as if its slot were out of geo reach
            let Some((lv, lw, lf)) = layer else { continue };
            if pending.first().is_some_and(|p| p.tmin != jb.tmin) {
                flush(&mut pending, a, &mut on_slot);
            }
            visit(jb, a.ww, weights, |t, wv, k| {
                a.acc[t] += wv * lv[k];
                a.wsum[t] += wv * lw[k];
                a.cmax[t] = a.cmax[t].max(lf[k]);
            });
            pending.push(jb.clone());
        }
    }
    flush(&mut pending, a, &mut on_slot);
}

/// Window rows/cols (quarter res) of a cell's 3x3 neighbourhood.
fn window_ix(r: usize, c: usize) -> (Vec<usize>, Vec<usize>) {
    let rows = ((r.saturating_sub(1)) * CELL..((r + 2) * CELL).min(H))
        .step_by(Q)
        .map(|y| y / Q)
        .collect();
    let cols = (0..3 * CELL / Q)
        .map(|j| ((c * CELL + W - CELL + j * Q) % W) / Q)
        .collect();
    (rows, cols)
}

fn std(v: &[f64]) -> f64 {
    let m = v.iter().sum::<f64>() / v.len() as f64;
    (v.iter().map(|x| (x - m).powi(2)).sum::<f64>() / v.len() as f64).sqrt()
}

fn corr(a: &[f64], b: &[f64]) -> f64 {
    let (ma, mb) = (
        a.iter().sum::<f64>() / a.len() as f64,
        b.iter().sum::<f64>() / b.len() as f64,
    );
    let (mut sab, mut saa, mut sbb) = (0.0, 0.0, 0.0);
    for (x, y) in a.iter().zip(b) {
        sab += (x - ma) * (y - mb);
        saa += (x - ma).powi(2);
        sbb += (y - mb).powi(2);
    }
    sab / (saa * sbb).sqrt()
}

/// Feather-band cells with >= 2 candidate passes >= 20 min apart take the pass whose geo IR correlates best
/// with the composite over the 3x3 neighbourhood, when one wins clearly.
#[allow(clippy::too_many_arguments)]
fn pick_by_correlation(
    cells: &mut [Option<Cands>],
    band_c: &[bool],
    reach: &[bool],
    satc: &[Vec<bool>],
    op4: &[f32],
    cv4: &[bool],
    dec: &Decoder,
    frames: &Path,
    allow: bool,
    date: Date,
) {
    let amb: Vec<usize> = (0..HC * WC)
        .filter(|&i| {
            let Some(cs) = &cells[i] else { return false };
            let (mn, mx) = cs.iter().fold((f64::MAX, f64::MIN), |(a, b), (t, _)| {
                (a.min(*t), b.max(*t))
            });
            band_c[i] && reach[i] && cs.len() > 1 && mx - mn >= 20.0
        })
        .collect();
    let mut by_slot: Vec<(i32, Vec<bool>)> = Vec::new();
    for &cell in &amb {
        let (r, c) = (cell / WC, cell % WC);
        for (tt, _) in cells[cell].as_ref().unwrap() {
            let s = slot_of(*tt);
            let pos = by_slot
                .iter()
                .position(|(k, _)| *k == s)
                .unwrap_or_else(|| {
                    by_slot.push((s, vec![false; HC * WC]));
                    by_slot.len() - 1
                });
            for rr in r.saturating_sub(1)..(r + 2).min(HC) {
                for cc in [(c + WC - 1) % WC, c, (c + 1) % WC] {
                    by_slot[pos].1[rr * WC + cc] = true;
                }
            }
        }
    }
    let jobs = plan(&by_slot, CORE_PAD, satc, Q, date);
    eprintln!(
        "  correlation pick: {} ambiguous cells, {} candidate slots, {} frame requests",
        amb.len(),
        by_slot.len(),
        jobs.len()
    );
    fetch::prefetch(frames, &jobs, allow);
    let (hq, wq) = (H / Q, W / Q);
    let mut a = Acc::new(hq, wq);
    let mut windows: std::collections::HashMap<(usize, i32), Vec<f64>> =
        std::collections::HashMap::new();
    accumulate(&jobs, dec, frames, &mut a, None, |slot, a, sj| {
        for &cell in &amb {
            if !cells[cell]
                .as_ref()
                .unwrap()
                .iter()
                .any(|(tt, _)| slot_of(*tt) == slot)
            {
                continue;
            }
            let (rows, cols) = window_ix(cell / WC, cell % WC);
            let g: Vec<f64> = rows
                .iter()
                .flat_map(|&y| cols.iter().map(move |&x| y * wq + x))
                .map(|i| {
                    if a.cov[i] > 0.3 {
                        dec.qmap.eval(a.acc[i] / a.wsum[i].max(1e-9)) as f64
                    } else {
                        f64::NAN
                    }
                })
                .collect();
            windows.insert((cell, slot), g);
        }
        for jb in sj {
            let (h, w) = ((jb.y1 - jb.y0) / jb.scale, (jb.x1 - jb.x0) / jb.scale);
            for i in 0..h {
                for j in 0..w {
                    let k = target(jb, i, j, a.ww);
                    (a.acc[k], a.wsum[k], a.cov[k]) = (0.0, 0.0, 0.0);
                }
            }
        }
    });
    let (mut decided, mut changed, mut best) = (0, 0, Vec::new());
    for &cell in &amb {
        let (rows, cols) = window_ix(cell / WC, cell % WC);
        let ix: Vec<usize> = rows
            .iter()
            .flat_map(|&y| cols.iter().map(move |&x| y * wq + x))
            .collect();
        let cs = cells[cell].clone().unwrap();
        let scores: Vec<f64> = cs
            .iter()
            .map(|(tt, _)| {
                let Some(g) = windows.get(&(cell, slot_of(*tt))) else {
                    return -2.0;
                };
                let (rv, gv): (Vec<f64>, Vec<f64>) = ix
                    .iter()
                    .zip(g)
                    .filter(|(&i, gi)| cv4[i] && gi.is_finite())
                    .map(|(&i, &gi)| (op4[i] as f64, gi))
                    .unzip();
                if rv.len() < 200 || std(&rv) < 0.03 || std(&gv) < 0.03 {
                    -2.0
                } else {
                    corr(&rv, &gv)
                }
            })
            .collect();
        let mut order: Vec<usize> = (0..scores.len()).collect();
        order.sort_by(|&a, &b| scores[a].total_cmp(&scores[b])); // stable, like numpy's small-n argsort
        order.reverse();
        if scores[order[0]] > 0.2 && scores[order[0]] - scores[order[1]] > 0.05 {
            decided += 1;
            changed += (order[0] != 0) as usize;
            best.push(scores[order[0]]);
            cells[cell] = Some(vec![cs[order[0]]]);
        }
    }
    best.sort_by(f64::total_cmp);
    let med = if best.is_empty() {
        f64::NAN
    } else if best.len() % 2 == 1 {
        best[best.len() / 2]
    } else {
        (best[best.len() / 2 - 1] + best[best.len() / 2]) / 2.0
    };
    eprintln!("  correlation: decided {decided}, undecided {}, changed {changed}, median best corr {med:.3}", amb.len() - decided);
}

/// Value of the nearest `has` pixel for every pixel, longitude periodic.
fn wrap_nearest(has: &[bool], val: &[f32], h: usize, w: usize) -> Vec<f32> {
    let pad = w / 4;
    let wp = w + 2 * pad;
    let m: Vec<bool> = (0..h * wp)
        .map(|i| !has[(i / wp) * w + (i % wp + w - pad) % w])
        .collect();
    let (iy, ix) = nearest_feature(&m, h, wp);
    (0..h * w)
        .into_par_iter()
        .map(|i| {
            let k = (i / w) * wp + i % w + pad;
            val[iy[k] as usize * w + (ix[k] as usize + w - pad) % w]
        })
        .collect()
}

pub struct Inputs<'a> {
    pub labels: &'a [i8],
    pub swaths: &'a [Swath],
    pub cv: &'a [bool],
    pub op: &'a [f32],
    pub wgt: &'a [f32],
    pub ice: &'a [f32],
    pub base: &'a [f32],
    pub date: Date,
}

/// Full-res fill = cov * qmap(blend) + (1 - cov) * baseline, geo frames time-matched to the bordering swaths.
/// Also returns `cov`, the weight each texel's fill takes from geostationary observation.
pub fn build_fill(
    x: &Inputs,
    orb: &Orbit,
    dec: &Decoder,
    frames: &Path,
    allow: bool,
) -> (Vec<f32>, Vec<f32>) {
    let support: Vec<bool> = x.wgt.par_iter().map(|&w| (1.0 - w) > 0.005).collect();
    let cs_mask: Vec<bool> = (0..W * H)
        .into_par_iter()
        .map(|i| x.cv[i] && support[i])
        .collect();
    let need = block_any(&cs_mask, H, W, CELL);
    let band_mask: Vec<bool> = (0..W * H)
        .into_par_iter()
        .map(|i| x.cv[i] && x.wgt[i] < 0.999 && x.ice[i] < 0.5)
        .collect();
    let band_c = block_any(&band_mask, H, W, CELL);
    let mut cells = cell_times(x.labels, x.swaths, &need, orb);
    let satc = satc();
    let reach: Vec<bool> = (0..HC * WC).map(|i| satc.iter().any(|s| s[i])).collect();

    let (hq, wq) = (H / Q, W / Q);
    let cv4 = subsample(x.cv, H, W, Q);
    let op4 = subsample(x.op, H, W, Q);
    pick_by_correlation(
        &mut cells, &band_c, &reach, &satc, &op4, &cv4, dec, frames, allow, x.date,
    );

    let tc: Vec<f32> = cells
        .iter()
        .map(|c| c.as_ref().map_or(f32::NAN, |v| v[0].0 as f32))
        .collect();
    let t4: Vec<f32> = (0..hq * wq)
        .map(|i| tc[(i / wq) / (CELL / Q) * WC + (i % wq) / (CELL / Q)])
        .collect();
    let has: Vec<bool> = (0..hq * wq).map(|i| cv4[i] && t4[i].is_finite()).collect();
    let t4z: Vec<f32> = t4
        .iter()
        .map(|v| if v.is_nan() { 0.0 } else { *v })
        .collect();
    let tfill = wrap_nearest(&has, &t4z, hq, wq);
    let slots4: Vec<i32> = tfill
        .iter()
        .map(|&v| {
            ((v / SLOT as f32)
                .round_ties_even()
                .clamp(0.0, (1440.0 / SLOT - 1.0) as f32)
                * SLOT as f32) as i32
        })
        .collect();
    let sup4 = subsample(&support, H, W, Q);
    let mut uniq: Vec<i32> = (0..hq * wq)
        .filter(|&i| sup4[i])
        .map(|i| slots4[i])
        .collect();
    uniq.sort();
    uniq.dedup();
    let mut weights: Vec<(i32, Sparse)> = uniq
        .par_iter()
        .map(|&sl| {
            (
                sl,
                slot_weight(
                    &(0..hq * wq)
                        .map(|i| slots4[i] == sl && sup4[i])
                        .collect::<Vec<bool>>(),
                ),
            )
        })
        .collect();
    let mut tot = vec![0f32; hq * wq];
    for (_, s) in &weights {
        for i in 0..s.h * s.w {
            tot[(s.r0 + i / s.w) * wq + (s.c0 + i % s.w) % wq] += s.v[i];
        }
    }
    let mut masks: Vec<(i32, Vec<bool>)> = Vec::new();
    for (sl, s) in weights.iter_mut() {
        let mut mc = vec![false; HC * WC];
        for i in 0..s.h * s.w {
            let (r, c) = (s.r0 + i / s.w, (s.c0 + i % s.w) % wq);
            s.v[i] /= tot[r * wq + c].max(1e-6);
            if s.v[i] > 1e-3 && sup4[r * wq + c] {
                mc[(r / (CELL / Q)) * WC + c / (CELL / Q)] = true;
            }
        }
        mc.iter_mut().zip(&reach).for_each(|(m, &r)| *m &= r);
        if mc.iter().any(|&b| b) {
            masks.push((*sl, mc));
        }
    }
    let jobs = plan(&masks, FILL_PAD, &satc, 1, x.date);
    eprintln!(
        "  fill: {} slots ({} within geo reach), {} frame requests",
        weights.len(),
        masks.len(),
        jobs.len()
    );
    fetch::prefetch(frames, &jobs, allow);

    let mut a = Acc::new(H, W);
    accumulate(&jobs, dec, frames, &mut a, Some(&weights), |_, _, _| {});
    let blend: Vec<u8> = a
        .acc
        .par_iter()
        .zip(&a.wsum)
        .map(|(&ac, &ws)| {
            ((if ws > 0.0 { ac / ws.max(1e-9) } else { 0.0 }) * 255.0).round_ties_even() as u8
        })
        .collect();
    let blend = median3_u8(&blend, H, W);
    let cov: Vec<f32> = (0..W * H)
        .into_par_iter()
        .map(|i| a.cov[i].clamp(0.0, 1.0) * (1.0 - x.ice[i]))
        .collect();
    let fill = (0..W * H)
        .into_par_iter()
        .map(|i| cov[i] * dec.qmap.eval(blend[i] as f32 / 255.0) + (1.0 - cov[i]) * x.base[i])
        .collect();
    (fill, cov)
}
