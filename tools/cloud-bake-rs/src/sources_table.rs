//! Every WMS layer the bake reads, in one table. Whether losing a source is fatal, where a geostationary
//! satellite sits, how its frames decode and which longitudes it covers are columns here, so no call
//! site branches on a source id to decide any of it.
pub enum Host {
    Gibs,
    Eumetsat,
}

pub enum Kind {
    Granule,
    Mosaic,
    Geo,
}

/// How a geostationary frame's pixels become a temperature.
pub enum Decode {
    /// GIBS 'Infrared Brightness Temperature' colour map, inverted.
    GibsColourMap,
    /// EUMETView grey level through the frozen LUT under this key of `assets/geo-calib.json`.
    GreyLut(&'static str),
}

/// What only a geostationary (`Kind::Geo`) row has.
pub struct GeoView {
    /// Sub-satellite longitude, degrees east.
    pub sub_lon: f64,
    pub decode: Decode,
    /// Fetched longitude window `(lo, lo + ramp_in, hi - ramp_out, hi)`: zero outside, ramped in from the
    /// cut edges. `None` = no cut (the whole visible disc).
    pub lon_window: Option<(f64, f64, f64, f64)>,
}

pub struct Source {
    pub id: &'static str,
    pub host: Host,
    pub layer: &'static str,
    pub styles: &'static str,
    pub kind: Kind,
    /// Missing or broken -> the bake cannot proceed (exit 3); any other source is skipped.
    pub required: bool,
    pub geo: Option<GeoView>,
}

impl Source {
    /// The geostationary columns of a `Kind::Geo` row.
    pub fn view(&self) -> &GeoView {
        self.geo.as_ref().expect("not a geostationary source")
    }
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
        geo: None,
    },
    Source {
        id: "viirs_tc",
        host: Host::Gibs,
        layer: "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
        styles: "",
        kind: Kind::Mosaic,
        required: true,
        geo: None,
    },
    Source {
        id: "viirs21_tc",
        host: Host::Gibs,
        layer: "VIIRS_NOAA21_CorrectedReflectance_TrueColor",
        styles: "",
        kind: Kind::Mosaic,
        required: false,
        geo: None,
    },
    Source {
        id: "goes_e",
        host: Host::Gibs,
        layer: "GOES-East_ABI_Band13_Clean_Infrared",
        styles: "",
        kind: Kind::Geo,
        required: false,
        geo: Some(GeoView {
            sub_lon: -75.2,
            decode: Decode::GibsColourMap,
            lon_window: None,
        }),
    },
    Source {
        id: "goes_w",
        host: Host::Gibs,
        layer: "GOES-West_ABI_Band13_Clean_Infrared",
        styles: "",
        kind: Kind::Geo,
        required: false,
        geo: Some(GeoView {
            sub_lon: -137.0,
            decode: Decode::GibsColourMap,
            lon_window: None,
        }),
    },
    Source {
        id: "hima",
        host: Host::Gibs,
        layer: "Himawari_AHI_Band13_Clean_Infrared",
        styles: "",
        kind: Kind::Geo,
        required: false,
        geo: Some(GeoView {
            sub_lon: 140.7,
            decode: Decode::GibsColourMap,
            lon_window: None,
        }),
    },
    Source {
        id: "mtg",
        host: Host::Eumetsat,
        layer: "mtg_fd:ir105_hrfi",
        styles: "mtg_fd:mtg_fd_ir105_hrfi_grayscale",
        kind: Kind::Geo,
        required: false,
        geo: Some(GeoView {
            sub_lon: 0.0,
            decode: Decode::GreyLut("mtg_lut"),
            lon_window: None,
        }),
    },
    Source {
        id: "iodc",
        host: Host::Eumetsat,
        layer: "msg_iodc:ir108",
        styles: "",
        kind: Kind::Geo,
        required: false,
        geo: Some(GeoView {
            sub_lon: 45.5,
            decode: Decode::GreyLut("iodc_lut"),
            lon_window: Some((28.125, 38.0, 108.0, 118.125)),
        }),
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
