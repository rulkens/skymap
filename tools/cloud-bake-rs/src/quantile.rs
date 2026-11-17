//! numpy percentile ('linear'), interp and the bake's quantile maps (bake.py `qmatch`, geofill `qmap`).
use rayon::prelude::*;

/// Percentiles (0..100) of `v`, sorted in place.
pub fn percentiles(v: &mut [f32], qs: &[f64]) -> Vec<f64> {
    v.par_sort_unstable_by(|a, b| a.total_cmp(b));
    let n = v.len();
    qs.iter()
        .map(|q| {
            let x = q / 100.0 * (n - 1) as f64;
            let lo = x.floor() as usize;
            let hi = (lo + 1).min(n - 1);
            let t = x - lo as f64;
            let (a, b) = (v[lo] as f64, v[hi] as f64);
            // numpy _lerp: a + (b-a)*t, evaluated from b's side past the midpoint
            if t >= 0.5 {
                b - (b - a) * (1.0 - t)
            } else {
                a + (b - a) * t
            }
        })
        .collect()
}

pub fn linspace(a: f64, b: f64, n: usize) -> Vec<f64> {
    (0..n)
        .map(|i| a + (b - a) * i as f64 / (n - 1) as f64)
        .collect()
}

/// Piecewise-linear map, np.interp semantics (clamped ends).
#[derive(Clone)]
pub struct Interp {
    pub xp: Vec<f64>,
    pub fp: Vec<f64>,
}

impl Interp {
    pub fn eval(&self, x: f32) -> f32 {
        let x = x as f64;
        let (xp, fp) = (&self.xp, &self.fp);
        let n = xp.len();
        if x.is_nan() {
            return f32::NAN;
        }
        if x <= xp[0] {
            return fp[0] as f32;
        }
        if x >= xp[n - 1] {
            return fp[n - 1] as f32;
        }
        let j = xp.partition_point(|&v| v <= x) - 1;
        let s = (fp[j + 1] - fp[j]) / (xp[j + 1] - xp[j]);
        (s * (x - xp[j]) + fp[j]) as f32
    }

    pub fn apply(&self, x: &[f32]) -> Vec<f32> {
        x.par_iter().map(|&v| self.eval(v)).collect()
    }

    /// bake.py qmatch tail: anchor 0 -> 0, extend to 1, force monotone.
    pub fn quantile_map(qs_mid: &[f64], qr_mid: &[f64]) -> Interp {
        let n = qs_mid.len() + 2;
        let mut qs = Vec::with_capacity(n);
        qs.push(0.0);
        qs.extend_from_slice(qs_mid);
        qs.push(1.0);
        let mut qr = Vec::with_capacity(n);
        qr.push(0.0);
        qr.extend_from_slice(qr_mid);
        qr.push(qr_mid[qr_mid.len() - 1] + (1.0 - qs_mid[qs_mid.len() - 1]));
        let mut run = f64::NEG_INFINITY;
        for (i, v) in qs.iter_mut().enumerate() {
            run = run.max(*v + i as f64 * 1e-6);
            *v = run;
        }
        let mut run = f64::NEG_INFINITY;
        for v in qr.iter_mut() {
            run = run.max(*v);
            *v = run;
        }
        Interp { xp: qs, fp: qr }
    }
}

/// bake.py qmatch(src, ref, mask): quantile-map src's distribution onto ref's over mask.
pub fn qmatch(src: &[f32], reference: &[f32], mask: &[bool]) -> Interp {
    let q = linspace(0.0, 100.0, 201);
    let (mut a, mut b): (Vec<f32>, Vec<f32>) = src
        .par_iter()
        .zip(reference.par_iter())
        .zip(mask.par_iter())
        .filter(|(_, &m)| m)
        .map(|((&s, &r), _)| (s, r))
        .unzip();
    let qs = percentiles(&mut a, &q);
    let qr = percentiles(&mut b, &q);
    Interp::quantile_map(&qs, &qr)
}

/// np.polyfit(x, y, 1) -> (slope, intercept).
pub fn polyfit1(x: &[f64], y: &[f64]) -> (f64, f64) {
    let n = x.len() as f64;
    let (mx, my) = (x.iter().sum::<f64>() / n, y.iter().sum::<f64>() / n);
    let sxy: f64 = x.iter().zip(y).map(|(a, b)| (a - mx) * (b - my)).sum();
    let sxx: f64 = x.iter().map(|a| (a - mx) * (a - mx)).sum();
    let g = sxy / sxx;
    (g, my - g * mx)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percentile_and_interp_match_numpy() {
        let mut v = vec![4.0f32, 1.0, 3.0, 2.0];
        // np.percentile([1,2,3,4], [10, 50, 90]) == [1.3, 2.5, 3.7]
        let p = percentiles(&mut v, &[10.0, 50.0, 90.0]);
        for (a, b) in p.iter().zip([1.3, 2.5, 3.7]) {
            assert!((a - b).abs() < 1e-9);
        }
        let f = Interp {
            xp: vec![0.0, 1.0, 3.0],
            fp: vec![0.0, 10.0, 30.0],
        };
        assert_eq!(f.eval(2.0), 20.0);
        assert_eq!(f.eval(-1.0), 0.0);
        assert_eq!(f.eval(5.0), 30.0);
    }
}
