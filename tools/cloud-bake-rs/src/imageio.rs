//! Decoders, PIL's BOX resize (exact fixed-point port, for the Blue Marble ice mask) and the lossless WebP
//! writer with bake.py `write()`'s layout: RGB = grey, A = Rec.709 luminance of that grey (= the grey).
use crate::grid::{lat, lon, smoothstep, smoothstep64, H, W};
use image::ImageReader;
use rayon::prelude::*;
use std::path::Path;

pub struct Rgba {
    pub w: usize,
    pub h: usize,
    pub px: Vec<u8>, // RGBA
}

fn reader(p: &Path) -> ImageReader<std::io::BufReader<std::fs::File>> {
    let mut r = ImageReader::open(p).unwrap_or_else(|e| panic!("{}: {e}", p.display()));
    r.no_limits();
    r.with_guessed_format().unwrap()
}

/// PIL `convert('RGBA')` (palette + tRNS expand to RGBA).
pub fn rgba(p: &Path) -> Rgba {
    let im = reader(p)
        .decode()
        .unwrap_or_else(|e| panic!("{}: {e}", p.display()))
        .into_rgba8();
    Rgba {
        w: im.width() as usize,
        h: im.height() as usize,
        px: im.into_raw(),
    }
}

/// PIL `convert('RGB')` as interleaved RGB. JPEGs go through libjpeg-turbo (mozjpeg's decoder, ISLOW
/// DCT, fancy upsampling) like Pillow: the pure-Rust decoder differs by 1 LSB here and there, which moves
/// the mosaics' `max(RGB) < 12` no-data test and so the speck masks.
pub fn rgb(p: &Path) -> (usize, usize, Vec<u8>) {
    if p.extension().is_some_and(|e| e == "jpg") {
        let data = std::fs::read(p).unwrap_or_else(|e| panic!("{}: {e}", p.display()));
        let mut d = mozjpeg::Decompress::new_mem(&data).unwrap();
        d.dct_method(mozjpeg::DctMethod::IntegerSlow);
        d.do_fancy_upsampling(true);
        let mut s = d.rgb().unwrap();
        let (w, h) = (s.width(), s.height());
        let px = s.read_scanlines::<u8>().unwrap();
        s.finish().unwrap();
        return (w, h, px);
    }
    let im = reader(p)
        .decode()
        .unwrap_or_else(|e| panic!("{}: {e}", p.display()))
        .into_rgb8();
    (im.width() as usize, im.height() as usize, im.into_raw())
}

/// A frame the server rendered as black (GOES-East once served one): of the non-transparent pixels, at
/// least 99% have R = G = B = 0. A frame with no opaque pixel is just empty sky, not broken.
pub fn is_all_black(rgba: &[u8]) -> bool {
    let (mut opaque, mut black) = (0usize, 0usize);
    for c in rgba.chunks_exact(4).filter(|c| c[3] > 0) {
        opaque += 1;
        black += (c[0] | c[1] | c[2] == 0) as usize;
    }
    opaque > 0 && black * 100 >= opaque * 99
}

/// The shipped baseline (cloud_combined_8192.tif, grey RGB) as u8 L.
pub fn baseline(p: &Path) -> Vec<u8> {
    let (w, h, px) = rgb(p);
    assert_eq!((w, h), (W, H));
    px.par_chunks(3)
        .map(|c| {
            ((c[0] as u32 * 19595 + c[1] as u32 * 38470 + c[2] as u32 * 7471 + 0x8000) >> 16) as u8
        })
        .collect()
}

const PREC: u32 = 22; // Pillow PRECISION_BITS = 32 - 8 - 2

/// Pillow precompute_coeffs for BOX + normalize_coeffs_8bpc: per output (xmin, fixed-point weights).
fn box_coeffs(in_size: usize, out_size: usize) -> Vec<(usize, Vec<i32>)> {
    let scale = in_size as f64 / out_size as f64;
    let fs = scale.max(1.0);
    let support = 0.5 * fs;
    (0..out_size)
        .map(|xx| {
            let center = (xx as f64 + 0.5) * scale;
            let xmin = ((center - support + 0.5) as i64).max(0) as usize;
            let xmax = (((center + support + 0.5) as i64).min(in_size as i64) as usize) - xmin;
            let k: Vec<f64> = (0..xmax)
                .map(|x| {
                    let v = (x as f64 + xmin as f64 - center + 0.5) / fs;
                    if v > -0.5 && v <= 0.5 {
                        1.0
                    } else {
                        0.0
                    }
                })
                .collect();
            let ww: f64 = k.iter().sum();
            let k = k
                .iter()
                .map(|&v| {
                    let v = if ww != 0.0 { v / ww } else { v };
                    if v < 0.0 {
                        (-0.5 + v * (1u32 << PREC) as f64) as i32
                    } else {
                        (0.5 + v * (1u32 << PREC) as f64) as i32
                    }
                })
                .collect();
            (xmin, k)
        })
        .collect()
}

fn clip8(ss: i64) -> u8 {
    (ss >> PREC).clamp(0, 255) as u8
}

/// PIL `Image.resize((ow, oh), Image.BOX)` on interleaved u8 with `ch` channels: horizontal pass into an
/// 8-bit intermediate, then vertical, exactly as ImagingResampleInner.
pub fn resize_box(px: &[u8], w: usize, h: usize, ch: usize, ow: usize, oh: usize) -> Vec<u8> {
    let kx = box_coeffs(w, ow);
    let ky = box_coeffs(h, oh);
    let y_first = ky[0].0;
    let y_last = ky[oh - 1].0 + ky[oh - 1].1.len();
    let th = y_last - y_first;
    let mut tmp = vec![0u8; th * ow * ch];
    tmp.par_chunks_mut(ow * ch).enumerate().for_each(|(y, o)| {
        let row = &px[(y + y_first) * w * ch..(y + y_first + 1) * w * ch];
        for (xx, (xmin, k)) in kx.iter().enumerate() {
            for c in 0..ch {
                let mut ss: i64 = 1 << (PREC - 1);
                for (x, &kv) in k.iter().enumerate() {
                    ss += row[(xmin + x) * ch + c] as i64 * kv as i64;
                }
                o[xx * ch + c] = clip8(ss);
            }
        }
    });
    let mut out = vec![0u8; oh * ow * ch];
    out.par_chunks_mut(ow * ch).enumerate().for_each(|(yy, o)| {
        let (ymin, k) = &ky[yy];
        let ymin = ymin - y_first;
        for (i, v) in o.iter_mut().enumerate() {
            let mut ss: i64 = 1 << (PREC - 1);
            for (y, &kv) in k.iter().enumerate() {
                ss += tmp[(ymin + y) * ow * ch + i] as i64 * kv as i64;
            }
            *v = clip8(ss);
        }
    });
    out
}

fn soft_box(lat0: f64, lat1: f64, lon0: f64, lon1: f64, y: usize, x: usize) -> f64 {
    let e = 3.0;
    let la = smoothstep64(lat0 - e, lat0, lat(y)) * (1.0 - smoothstep64(lat1, lat1 + e, lat(y)));
    let lo = smoothstep64(lon0 - e, lon0, lon(x)) * (1.0 - smoothstep64(lon1, lon1 + e, lon(x)));
    (la * lo) as f32 as f64
}

/// bake.py ice_sheets(): permanent-ice weight where the Blue Marble (resized BOX to 8192x4096) is white.
pub fn ice_sheets(blue_marble: &Path) -> Vec<f32> {
    let (w, h, px) = rgb(blue_marble);
    let small = resize_box(&px, w, h, 3, W, H);
    drop(px);
    (0..W * H)
        .into_par_iter()
        .map(|i| {
            let (y, x) = (i / W, i % W);
            let c = &small[i * 3..i * 3 + 3];
            let mn = c
                .iter()
                .map(|&v| v as f32 / 255.0)
                .fold(f32::INFINITY, f32::min);
            let region = (1.0 - smoothstep64(-62.0, -56.0, lat(y)))
                .max(soft_box(59.0, 84.0, -75.0, -10.0, y, x));
            (smoothstep(0.5, 0.7, mn) as f64 * region) as f32
        })
        .collect()
}

/// round(clip(grey, 0, 1) * 255) with numpy's half-to-even.
pub fn to_u8(grey: &[f32]) -> Vec<u8> {
    grey.par_iter()
        .map(|&g| (g.clamp(0.0, 1.0) * 255.0).round_ties_even() as u8)
        .collect()
}

fn rgba_of(g: &[u8]) -> Vec<u8> {
    g.par_iter().flat_map_iter(|&v| [v, v, v, v]).collect()
}

const WEBP_QUALITY: f32 = 25.0;
const WEBP_METHOD: i32 = 4;

/// libwebp lossless. For lossless, `quality` is the effort knob: 25 / method 4 is ~3x faster than
/// Pillow's 80 for +2.6% bytes. Written via `.part` + rename. Returns bytes written.
pub fn write_webp(path: &Path, g: &[u8]) -> usize {
    use libwebp_sys as ffi;
    let px = rgba_of(g);
    // SAFETY: the picture imports from `px` (W*H*4 bytes, stride W*4) and is freed before return; the
    // memory writer owns the output buffer until WebPMemoryWriterClear.
    unsafe {
        let mut cfg = ffi::WebPConfig::new().unwrap();
        cfg.lossless = 1;
        cfg.quality = WEBP_QUALITY;
        cfg.method = WEBP_METHOD;
        cfg.thread_level = 1;
        assert!(ffi::WebPValidateConfig(&cfg) != 0);
        let mut pic: ffi::WebPPicture = std::mem::zeroed();
        assert!(ffi::WebPPictureInit(&mut pic));
        pic.use_argb = 1;
        pic.width = W as i32;
        pic.height = H as i32;
        assert!(ffi::WebPPictureImportRGBA(&mut pic, px.as_ptr(), (W * 4) as i32) != 0);
        drop(px);
        let mut wr: ffi::WebPMemoryWriter = std::mem::zeroed();
        ffi::WebPMemoryWriterInit(&mut wr);
        pic.writer = Some(ffi::WebPMemoryWrite);
        pic.custom_ptr = &mut wr as *mut _ as *mut std::ffi::c_void;
        let ok = ffi::WebPEncode(&cfg, &mut pic);
        ffi::WebPPictureFree(&mut pic);
        assert!(ok != 0, "webp encode failed: {:?}", pic.error_code);
        crate::fetch::write_atomic(path, std::slice::from_raw_parts(wr.mem, wr.size));
        let n = wr.size;
        ffi::WebPMemoryWriterClear(&mut wr);
        n
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_all_black_flags_a_black_opaque_frame() {
        assert!(is_all_black(&[0, 0, 0, 255].repeat(100)));
    }

    #[test]
    fn is_all_black_ignores_transparent_pixels() {
        // 1000 transparent pixels (colour irrelevant) and 4 grey opaque ones: not black
        let mut px = [0, 0, 0, 0].repeat(1000);
        px.extend([90, 90, 90, 255].repeat(4));
        assert!(!is_all_black(&px));
        assert!(!is_all_black(&[0, 0, 0, 0].repeat(10)));
    }

    #[test]
    fn box_resize_is_a_mean_on_integer_ratios() {
        // 4x2 -> 2x1: horizontal pass rounds to an 8-bit row first (75.5 -> 76), then vertical (55.5 -> 56)
        let px = [10u8, 20, 30, 40, 50, 60, 70, 81];
        assert_eq!(resize_box(&px, 4, 2, 1, 2, 1), vec![35, 56]);
    }
}
