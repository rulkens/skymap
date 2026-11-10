//! Whether a bake may be written. Both thresholds are measured, not guessed; the numbers behind them sit
//! beside each constant so a refit knows what to re-measure.
use crate::probe::Calibration;

/// Fraction of texels backed by a same-day observation. Measured 2026-11-06 0.7679, 2026-11-09 0.7673
/// (Blue Marble December standing in for November's ice mask); the ~23% without is mostly permanent ice,
/// which both fall back to the static map. MIN_COVERAGE = 0.9 x min.
pub const MIN_COVERAGE: f64 = 0.690;
/// Median |dT| between overlapping geostationary decodes, MTG vs GOES-East / MTG vs IODC. Measured
/// 2026-11-06 5.15 / 4.15 K, 2026-11-09 4.77 / 4.40 K: the floor is view-angle and timing difference between
/// satellites, not calibration error. MAX_CAL_DRIFT_K = max(3, 2 x max).
pub const MAX_CAL_DRIFT_K: f64 = 10.3;

pub enum Verdict {
    Ok,
    Data(String),
    Drift(String),
}

/// Why the calibration has drifted, if it has. A skipped pair (NaN) never trips it.
pub fn drift(cal: &Calibration) -> Option<String> {
    [
        ("MTG vs GOES-East", cal.mtg_goes_e_k),
        ("MTG vs IODC", cal.mtg_iodc_k),
    ]
    .iter()
    .find(|(_, k)| *k > MAX_CAL_DRIFT_K)
    .map(|(pair, k)| format!("calibration drift {k:.2} K on {pair} (limit {MAX_CAL_DRIFT_K} K)"))
}

pub fn verdict(coverage: f64, cal: &Calibration) -> Verdict {
    if let Some(m) = drift(cal) {
        Verdict::Drift(m)
    } else if coverage < MIN_COVERAGE {
        Verdict::Data(format!(
            "coverage {coverage:.3} is below the floor {MIN_COVERAGE:.3}"
        ))
    } else {
        Verdict::Ok
    }
}

/// Fraction of texels whose final value is at least half same-day observation: the VIIRS composite
/// weight `wgt`, plus what remains of the fill (`1 - wgt`) times geostationary coverage `cov`.
pub fn coverage(wgt: &[f32], cov: &[f32]) -> f64 {
    let n = wgt
        .iter()
        .zip(cov)
        .filter(|(&w, &c)| w + (1.0 - w) * c >= 0.5)
        .count();
    n as f64 / wgt.len() as f64
}

#[cfg(test)]
mod tests {
    use super::*;

    const CALM: Calibration = Calibration {
        mtg_goes_e_k: 0.0,
        mtg_iodc_k: 0.0,
    };

    #[test]
    fn verdict_is_data_below_min_coverage() {
        assert!(matches!(
            verdict(MIN_COVERAGE - 0.01, &CALM),
            Verdict::Data(_)
        ));
        assert!(matches!(verdict(1.0, &CALM), Verdict::Ok));
    }

    #[test]
    fn verdict_is_drift_when_either_pair_exceeds_max_cal_drift_k() {
        let hot = MAX_CAL_DRIFT_K + 0.1;
        for cal in [
            Calibration {
                mtg_goes_e_k: hot,
                mtg_iodc_k: 0.0,
            },
            Calibration {
                mtg_goes_e_k: 0.0,
                mtg_iodc_k: hot,
            },
        ] {
            assert!(matches!(verdict(1.0, &cal), Verdict::Drift(_)));
        }
    }

    #[test]
    fn coverage_counts_texels_at_least_half_observed() {
        // composite only, fill only, half-and-half (counts), neither
        assert_eq!(coverage(&[1.0, 0.0, 0.5, 0.0], &[0.0, 1.0, 0.0, 0.2]), 0.75);
    }
}
