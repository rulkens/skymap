//! The one JSON line a run prints on stdout (exit 0, 3 and 4), for the scheduler that launches it. Logs go
//! to stderr, so stdout stays machine-readable.
use crate::date::Date;
use crate::fetch::STATS;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::atomic::Ordering::Relaxed;
use std::time::Instant;

/// What the run knows so far; a field a run stopped before computing stays null.
pub struct Summary {
    pub date: Date,
    pub out: PathBuf,
    pub started: Instant,
    pub coverage: Value,
    pub orbit: Value,
    pub calibration: Value,
}

impl Summary {
    pub fn new(date: Date, out: PathBuf) -> Summary {
        Summary {
            date,
            out,
            started: Instant::now(),
            coverage: Value::Null,
            orbit: Value::Null,
            calibration: Value::Null,
        }
    }

    pub fn json(&self, exit: i32) -> Value {
        json!({
            "date": self.date.to_string(),
            "exit": exit,
            "coverage": self.coverage,
            "orbit": self.orbit,
            "calibration": self.calibration,
            "skipped": {"missing": STATS.missing.load(Relaxed), "broken": STATS.broken.load(Relaxed)},
            "fetched": {
                "requests": STATS.requests.load(Relaxed),
                "mb": (STATS.bytes.load(Relaxed) as f64 / 1e5).round() / 10.0,
                "cached": STATS.cached.load(Relaxed),
            },
            "seconds": (self.started.elapsed().as_secs_f64() * 10.0).round() / 10.0,
            "out": self.out.display().to_string(),
        })
    }

    /// Print the line and leave with `exit`.
    pub fn finish(&self, exit: i32) -> ! {
        println!("{}", self.json(exit));
        std::process::exit(exit)
    }
}
