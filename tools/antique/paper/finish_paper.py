"""Turn the quilted scan into the final tileable albedo + 16-bit relief map.

usage: finish_paper.py <quilt_albedo.png> <out_dir> [seed=7] [mould=1]
mould=0 leaves laid/chain lines out of both maps (for hex-tiling with random offsets, where the
mould pattern must be drawn procedurally in sheet space or it doubles where cells blend).
Also writes paper_normal.png (8-bit, xyz*0.5+0.5, encoded at relief 8) because
browsers decode PNGs to 8 bits per channel: the 16-bit height only survives a custom decoder.

Height model: in reflected light thicker pulp is more opaque (brighter) and stands higher, so the
non-periodic relief is band-passed brightness, split by scale:
  tooth      sigma 1.5..12 px  felt/fibre surface (~0.2-1.5 mm at ~8.4 px/mm)
  formation  sigma 10..90 px   hand-made 'cloudiness' (pulp clumps, a few mm)
The mould pattern is procedural and written into BOTH maps so they agree:
  laid lines N/213 px (~1.15 mm, measured 9.6 px in the scan); the scan's own laid band is notched
             out of the albedo because quilting leaves it patchy (strength jumps at block seams)
  chain lines ~N/10 px (~24 mm), irregular spacing, laid lines shadowed more strongly beside them
Pigment inclusions (dark specks) are colour, not relief: they are removed before deriving height.
"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

src, out_dir = sys.argv[1], sys.argv[2]
rng = np.random.default_rng(int(sys.argv[3]) if len(sys.argv) > 3 else 7)
MOULD = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
a =np.asarray(Image.open(src).convert('RGB'), np.float32) / 255
lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
N = lin.shape[0]
W = np.array([0.2126, 0.7152, 0.0722], np.float32)
# Pin the tile to the mean colour of the cleanest margin (RP-P-AO-10-8C, bottom, sRGB) so the base
# colour is a documented constant; toning and stains belong in stains.png, not here.
TARGET_SRGB = np.array([243, 226, 204], np.float32) / 255
target_lin = ((TARGET_SRGB + 0.055) / 1.055) ** 2.4
lin = lin * (target_lin / lin.reshape(-1, 3).mean(0, dtype=np.float64)).astype(np.float32)  # f64: f32 axis-0 means drift by ~2%


def g(x, s):
    return ndimage.gaussian_filter(x, s, mode='wrap')


def unit(x):
    return (x - x.mean()) / x.std()


def smooth_noise(s):
    return unit(g(rng.standard_normal((N, N)).astype(np.float32), s))


# ---- fade the few large dark inclusions and bright abrasions: on a repeating tile they are the marks the eye locks onto.
# Small fibre specks stay. Fill = normalised-convolution blur of the surrounding clean paper.
L = lin @ W
ratio = L / g(L, 12)
dark = (ratio < 0.93) | (ratio > 1.05)            # bright abrasions repeat just as visibly
lab, n = ndimage.label(dark)
sizes = ndimage.sum(np.ones_like(L), lab, index=np.arange(1, n + 1))
big = np.isin(lab, 1 + np.flatnonzero(sizes > 40))
big = ndimage.binary_dilation(big, iterations=3)
keep = (~big).astype(np.float32)
fill = np.stack([g(lin[..., k] * keep, 6) for k in range(3)], -1) / np.maximum(g(keep, 6), 1e-4)[..., None]
w = (0.8 * g(big.astype(np.float32), 1.5))[..., None]
lin = lin * (1 - w) + fill * w
print('faded inclusions:', int((sizes > 40).sum()))

# ---- notch the scan's laid band out of the albedo (luminance ratio, so colour is untouched) ----
L = lin @ W
f = np.fft.fftfreq(N)
fy, fx = np.meshgrid(f, f, indexing='ij')
band = np.exp(-((np.abs(fy) - 1 / 9.6) / 0.012) ** 2) * np.exp(-(fx / 0.006) ** 2)
laid_scan = np.real(np.fft.ifft2(np.fft.fft2(L) * band))
lin = lin * ((L - laid_scan) / L)[..., None]
L = lin @ W

# ---- procedural mould: chain lines, then laid lines tied to them ----
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
n_chain = max(1, round(N / 205))
gaps = rng.uniform(0.85, 1.15, n_chain)
centres = np.cumsum(gaps) / gaps.sum() * N
dist = np.full((N, N), np.inf, np.float32)          # signed distance to the nearest chain line
for cx in centres:
    ph = rng.random(2)
    wob = 2.2 * np.sin(2 * np.pi * (yy / N * 2 + ph[0])) + 1.0 * np.sin(2 * np.pi * (yy / N * 7 + ph[1]))
    d = (xx + wob - cx + N / 2) % N - N / 2
    dist = np.where(np.abs(d) < np.abs(dist), d, dist)
chain = -np.exp(-(dist / 5.0) ** 2) + 0.2 * np.exp(-(dist / 26.0) ** 2)

n_laid = round(N / 9.6)
ydisp = 1.6 * smooth_noise(220) + 0.5 * smooth_noise(40)       # wires are never quite straight
# laid wires sag between the chain ties: a slight bow, zero at each chain line
spacing = N / n_chain
bow = 0.8 * np.sin(np.pi * np.clip((np.abs(dist) * 2) / spacing, 0, 1))
phase = 2 * np.pi * (yy + ydisp + bow) * n_laid / N
ridge = (0.5 + 0.5 * np.cos(phase)) ** 1.6
amp = np.clip(0.75 + 0.25 * smooth_noise(90), 0.3, 1.2) * (1 + 0.6 * np.exp(-(dist / 14.0) ** 2))
laid = unit(ridge * amp)
chain_raw = chain                 # -1 over the wire, ~0 between lines
chain = unit(chain)

# albedo: thin places over the wires read a touch darker in reflected light (pulp is thinner there)
shade = 1 + MOULD * (0.005 * laid + 0.006 * chain_raw)
lin_out = np.clip(lin * shade[..., None], 0, 1)
srgb = np.where(lin_out <= 0.0031308, lin_out * 12.92, 1.055 * lin_out ** (1 / 2.4) - 0.055)
Image.fromarray((srgb * 255 + 0.5).astype(np.uint8)).save(os.path.join(out_dir, 'paper_albedo.png'))

# ---- height ----
Ln = L / L.mean()
med = ndimage.median_filter(Ln, size=9, mode='wrap')
speck = ndimage.binary_dilation(Ln < med - 0.035, iterations=2)
Lc = np.where(speck, g(med, 2), Ln)
tooth = unit(g(Lc, 1.5) - g(Lc, 12))
formation = unit(g(Lc, 10) - g(Lc, 90))
h = 1.0 * tooth + 0.55 * formation + MOULD * (0.40 * laid + 0.28 * chain)
lo, hi = np.percentile(h, [0.1, 99.9])
h = np.clip((h - lo) / (hi - lo), 0, 1)
Image.fromarray((h * 65535 + 0.5).astype(np.uint16)).save(os.path.join(out_dir, 'paper_height.png'))
# Encoded at relief 8 (1 height unit = 8 texels): at relief 1 the slopes span only ~±4 of 8-bit's
# 256 levels. Shader: n.xy *= wanted_relief / 8, then renormalise.
gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * 8
gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * 8
nrm = np.stack([-gx, -gy, np.ones_like(h)], -1)          # +y = down the image (texture v)
nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
Image.fromarray((nrm * 127.5 + 128).clip(0, 255).astype(np.uint8)).save(os.path.join(out_dir, 'paper_normal.png'))
print('written; height mean', round(float(h.mean()), 3), 'std', round(float(h.std()), 3))
