//! A calendar UTC day as a value. The bake is keyed by day (cache directory, WMS TIME), and WMS times
//! near midnight spill into the neighbouring day, so it needs validation and day arithmetic, nothing more.
use std::fmt;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Date {
    pub y: i32,
    pub m: u32,
    pub d: u32,
}

fn days_in_month(y: i32, m: u32) -> u32 {
    match m {
        2 if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

impl Date {
    /// Strictly `YYYY-MM-DD` (zero-padded) and a day that exists in that month.
    pub fn parse(s: &str) -> Result<Date, String> {
        let bad = || format!("not a calendar date (want YYYY-MM-DD): {s:?}");
        let b = s.as_bytes();
        let digits = |r: std::ops::Range<usize>| b[r].iter().all(u8::is_ascii_digit);
        if b.len() != 10
            || b[4] != b'-'
            || b[7] != b'-'
            || !digits(0..4)
            || !digits(5..7)
            || !digits(8..10)
        {
            return Err(bad());
        }
        let (y, m, d) = (
            s[..4].parse::<i32>().unwrap(),
            s[5..7].parse::<u32>().unwrap(),
            s[8..].parse::<u32>().unwrap(),
        );
        if !(1..=12).contains(&m) || d < 1 || d > days_in_month(y, m) {
            return Err(bad());
        }
        Ok(Date { y, m, d })
    }

    /// The civil date `days` after 1970-01-01 (Howard Hinnant's `civil_from_days`).
    pub fn from_days_since_epoch(days: i64) -> Date {
        let z = days + 719_468;
        let era = z.div_euclid(146_097);
        let doe = z.rem_euclid(146_097);
        let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let m = if mp < 10 { mp + 3 } else { mp - 9 };
        Date {
            y: (yoe + era * 400 + (m <= 2) as i64) as i32,
            m: m as u32,
            d: (doy - (153 * mp + 2) / 5 + 1) as u32,
        }
    }

    /// The UTC day before today: the latest day whose NOAA-20 passes have all arrived.
    pub fn yesterday_utc() -> Date {
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock is before 1970")
            .as_secs();
        Date::from_days_since_epoch((secs / 86_400) as i64 - 1)
    }

    /// The date `n` days later (earlier for negative `n`).
    pub fn plus_days(self, n: i32) -> Date {
        let mut r = self;
        for _ in 0..n.abs() {
            if n > 0 {
                if r.d < days_in_month(r.y, r.m) {
                    r.d += 1;
                } else if r.m < 12 {
                    (r.m, r.d) = (r.m + 1, 1);
                } else {
                    (r.y, r.m, r.d) = (r.y + 1, 1, 1);
                }
            } else if r.d > 1 {
                r.d -= 1;
            } else if r.m > 1 {
                (r.m, r.d) = (r.m - 1, days_in_month(r.y, r.m - 1));
            } else {
                (r.y, r.m, r.d) = (r.y - 1, 12, 31);
            }
        }
        r
    }
}

impl fmt::Display for Date {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{:04}-{:02}-{:02}", self.y, self.m, self.d)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leap_years_follow_the_gregorian_rule() {
        assert!(Date::parse("2024-02-29").is_ok());
        assert!(Date::parse("2100-02-29").is_err());
        assert!(Date::parse("2000-02-29").is_ok());
    }

    #[test]
    fn civil_date_from_days_since_epoch() {
        let d = |n| Date::from_days_since_epoch(n).to_string();
        assert_eq!(d(0), "1970-01-01");
        assert_eq!(d(20401), "2025-11-09");
        assert_eq!(d(20819), "2027-01-01");
    }

    #[test]
    fn plus_days_crosses_month_and_year_edges() {
        let d = |s| Date::parse(s).unwrap();
        assert_eq!(d("2024-03-01").plus_days(-1), d("2024-02-29"));
        assert_eq!(d("2026-12-31").plus_days(1), d("2027-01-01"));
        assert_eq!(d("2026-01-01").plus_days(-1), d("2025-12-31"));
    }
}
