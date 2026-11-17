//! The command line as a value: every input is a flag, nothing is read from the environment, so a run is
//! reproducible from its arguments. Errors come back as text for main to print (exit 2).
use crate::date::Date;
use std::path::PathBuf;

pub struct Args {
    pub date: Date,
    pub baseline: PathBuf,
    pub blue_marble: PathBuf,
    pub cache: PathBuf,
    pub out: PathBuf,
    pub offline: bool,
}

const REQUIRED: [&str; 4] = ["--baseline", "--blue-marble", "--cache", "--out"];

pub fn parse_args(argv: &[String]) -> Result<Args, String> {
    let mut vals: [Option<&String>; 4] = [None; 4];
    let (mut date, mut offline) = (None, false);
    let mut it = argv.iter();
    while let Some(k) = it.next() {
        if k == "--offline" {
            offline = true;
        } else if k == "--date" {
            date = Some(it.next().ok_or(format!("{k} needs a value"))?);
        } else if let Some(i) = REQUIRED.iter().position(|r| r == k) {
            vals[i] = Some(it.next().ok_or(format!("{k} needs a value"))?);
        } else {
            return Err(format!("unknown argument {k}"));
        }
    }
    let get = |i: usize| vals[i].ok_or(format!("{} is required", REQUIRED[i]));
    Ok(Args {
        date: date.map_or(Ok(Date::yesterday_utc()), |d| Date::parse(d))?,
        baseline: get(0)?.into(),
        blue_marble: get(1)?.into(),
        cache: get(2)?.into(),
        out: get(3)?.into(),
        offline,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(s: &str) -> Vec<String> {
        s.split_whitespace().map(str::to_owned).collect()
    }
    const ALL: &str =
        "--date 2026-11-09 --baseline b.tif --blue-marble bm.jpg --cache c --out o.webp";

    #[test]
    fn parse_args_accepts_a_full_command_line() {
        let a = parse_args(&v(&format!("{ALL} --offline"))).unwrap();
        assert!(a.offline && a.date.to_string() == "2026-11-09" && a.cache == PathBuf::from("c"));
        assert!(!parse_args(&v(ALL)).unwrap().offline);
    }

    #[test]
    fn parse_args_rejects_an_unknown_flag() {
        assert!(parse_args(&v(&format!("{ALL} --threads 4"))).is_err());
    }

    #[test]
    fn parse_args_rejects_2026_02_30_and_2026_1_5() {
        for d in ["2026-02-30", "2026-1-5"] {
            let line = ALL.replace("2026-11-09", d);
            assert!(parse_args(&v(&line)).is_err(), "{d}");
        }
    }

    #[test]
    fn parse_args_defaults_the_date_when_it_is_absent() {
        let line = ALL.replace("--date 2026-11-09 ", "");
        assert!(parse_args(&v(&line)).is_ok());
    }

    #[test]
    fn parse_args_requires_every_input_flag() {
        for f in REQUIRED {
            let mut a = v(ALL);
            let i = a.iter().position(|x| x == f).unwrap();
            a.drain(i..i + 2);
            assert!(parse_args(&a).err().unwrap().contains(f), "{f}");
        }
    }
}
