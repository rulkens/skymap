//! Every WMS layer the bake reads, in one table. Whether losing a source is fatal is a column here, so
//! no call site branches on a source id to decide it.
pub enum Host {
    Gibs,
    Eumetsat,
}

pub enum Kind {
    Granule,
    Mosaic,
    Geo,
}

pub struct Source {
    pub id: &'static str,
    pub host: Host,
    pub layer: &'static str,
    pub styles: &'static str,
    pub kind: Kind,
    /// Missing or broken -> the bake cannot proceed (exit 3); any other source is skipped.
    pub required: bool,
}

const fn row(
    id: &'static str,
    host: Host,
    layer: &'static str,
    styles: &'static str,
    kind: Kind,
    required: bool,
) -> Source {
    Source {
        id,
        host,
        layer,
        styles,
        kind,
        required,
    }
}

/// The NOAA-20 mosaic is required: it patches the NOAA-20 swaths in `hybridise`. The order of the `Geo`
/// rows is the satellite index geofill's per-satellite tables use.
pub const SOURCES: [Source; 8] = [
    row(
        "viirs_n20_granule",
        Host::Gibs,
        "VIIRS_NOAA20_CorrectedReflectance_TrueColor_Granule",
        "",
        Kind::Granule,
        false,
    ),
    row(
        "viirs_tc",
        Host::Gibs,
        "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
        "",
        Kind::Mosaic,
        true,
    ),
    row(
        "viirs21_tc",
        Host::Gibs,
        "VIIRS_NOAA21_CorrectedReflectance_TrueColor",
        "",
        Kind::Mosaic,
        false,
    ),
    row(
        "goes_e",
        Host::Gibs,
        "GOES-East_ABI_Band13_Clean_Infrared",
        "",
        Kind::Geo,
        false,
    ),
    row(
        "goes_w",
        Host::Gibs,
        "GOES-West_ABI_Band13_Clean_Infrared",
        "",
        Kind::Geo,
        false,
    ),
    row(
        "hima",
        Host::Gibs,
        "Himawari_AHI_Band13_Clean_Infrared",
        "",
        Kind::Geo,
        false,
    ),
    row(
        "mtg",
        Host::Eumetsat,
        "mtg_fd:ir105_hrfi",
        "mtg_fd:mtg_fd_ir105_hrfi_grayscale",
        Kind::Geo,
        false,
    ),
    row(
        "iodc",
        Host::Eumetsat,
        "msg_iodc:ir108",
        "",
        Kind::Geo,
        false,
    ),
];

pub fn by_id(id: &str) -> &'static Source {
    SOURCES
        .iter()
        .find(|s| s.id == id)
        .unwrap_or_else(|| panic!("no source {id}"))
}

pub fn geo() -> impl Iterator<Item = &'static Source> {
    SOURCES.iter().filter(|s| matches!(s.kind, Kind::Geo))
}

pub fn mosaics() -> impl Iterator<Item = &'static Source> {
    SOURCES.iter().filter(|s| matches!(s.kind, Kind::Mosaic))
}
