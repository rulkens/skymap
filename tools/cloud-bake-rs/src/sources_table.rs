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

/// The NOAA-20 mosaic is required: it patches the NOAA-20 swaths in `hybridise`. The order of the `Geo`
/// rows is the satellite index geofill's per-satellite tables use.
pub const SOURCES: [Source; 8] = [
    Source {
        id: "viirs_n20_granule",
        host: Host::Gibs,
        layer: "VIIRS_NOAA20_CorrectedReflectance_TrueColor_Granule",
        styles: "",
        kind: Kind::Granule,
        required: false,
    },
    Source {
        id: "viirs_tc",
        host: Host::Gibs,
        layer: "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
        styles: "",
        kind: Kind::Mosaic,
        required: true,
    },
    Source {
        id: "viirs21_tc",
        host: Host::Gibs,
        layer: "VIIRS_NOAA21_CorrectedReflectance_TrueColor",
        styles: "",
        kind: Kind::Mosaic,
        required: false,
    },
    Source {
        id: "goes_e",
        host: Host::Gibs,
        layer: "GOES-East_ABI_Band13_Clean_Infrared",
        styles: "",
        kind: Kind::Geo,
        required: false,
    },
    Source {
        id: "goes_w",
        host: Host::Gibs,
        layer: "GOES-West_ABI_Band13_Clean_Infrared",
        styles: "",
        kind: Kind::Geo,
        required: false,
    },
    Source {
        id: "hima",
        host: Host::Gibs,
        layer: "Himawari_AHI_Band13_Clean_Infrared",
        styles: "",
        kind: Kind::Geo,
        required: false,
    },
    Source {
        id: "mtg",
        host: Host::Eumetsat,
        layer: "mtg_fd:ir105_hrfi",
        styles: "mtg_fd:mtg_fd_ir105_hrfi_grayscale",
        kind: Kind::Geo,
        required: false,
    },
    Source {
        id: "iodc",
        host: Host::Eumetsat,
        layer: "msg_iodc:ir108",
        styles: "",
        kind: Kind::Geo,
        required: false,
    },
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
