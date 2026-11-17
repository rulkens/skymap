"""Full-sheet (not tiling) greyscale ageing mask: 0 = clean paper, 1 = darkest stain.

usage: build_stains.py <out stains.png> [width=2048] [height=1152] [seed=11]
Also writes <out>_layers.png: R = toning, G = foxing, B = tide lines, for per-type tints.

Layers, combined as 1 - prod(1 - layer) so overlaps darken without clipping:
  toning   browner toward the exposed edges (head and fore-edge most, gutter least), reach
           varies along each edge; plus faint low-frequency mottling across the sheet
  foxing   fungal/iron spots in CLUSTERS, density biased toward the edges and a damp zone;
           lognormal sizes, dark core + soft halo, outlines warped so none is a perfect disc
  tide     two water stains: a pale interior and a sharp darker rim where the drying front
           deposited the soluble brown (degraded cellulose); the rim is crisp on the OUTSIDE (the
           front stopped there) and feathers inward; doubled by a second, smaller wetting
At 2048 px across a ~500 mm sheet, 1 px is ~0.25 mm: foxing spots 0.3-4 mm -> 1-16 px.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

out = sys.argv[1]
W = int(sys.argv[2]) if len(sys.argv) > 2 else 2048
H = int(sys.argv[3]) if len(sys.argv) > 3 else 1152
rng = np.random.default_rng(int(sys.argv[4]) if len(sys.argv) > 4 else 11)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)


def noise(s):
    n = ndimage.gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), s, mode='reflect')
    return (n - n.mean()) / n.std()


def fbm(scales, gain=0.55):
    acc, amp, tot = 0, 1.0, 0
    for s in scales:
        acc = acc + amp * noise(s)
        tot += amp
        amp *= gain
    return acc / tot


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ---- toning ----
edge = np.minimum(np.minimum(xx, W - 1 - xx), np.minimum(yy, H - 1 - yy))
# A bound atlas tones unevenly: head and fore-edge (top, right) were exposed, the gutter (left) not.
toning_edge = np.zeros((H, W), np.float32)
depth_noise = fbm([180, 70])
for d, s in ((yy, 0.55), (W - 1 - xx, 0.5), (H - 1 - yy, 0.3), (xx, 0.14)):
    depth = 130 * (1 + 0.45 * depth_noise)                    # how far the browning reaches in, px
    band = s * np.exp(-np.maximum(d + 6 * noise(8), 0) / depth) + 0.5 * s * np.exp(-d / 7.0)
    toning_edge = 1 - (1 - toning_edge) * (1 - band)
toning_edge *= 0.8 + 0.2 * smoothstep(-1, 1, fbm([60, 20]))
mottle = 0.07 * smoothstep(-0.2, 2.0, fbm([260, 120, 50], 0.6))
toning = np.clip(toning_edge + mottle, 0, 1)

# ---- foxing ----
fox = np.zeros((H, W), np.float32)
damp = smoothstep(0.3, 1.6, fbm([300, 150]))                # a humid region of the sheet
edge_bias = np.exp(-edge / 260.0)
density = 0.15 + 0.9 * edge_bias + 0.9 * damp
warp_x, warp_y = 1.4 * noise(4), 1.4 * noise(4)
n_clusters = 70
cdf = np.cumsum(density.ravel())
cdf /= cdf[-1]
for _ in range(n_clusters):
    idx = np.searchsorted(cdf, rng.random())
    cy, cx = divmod(idx, W)
    n_spots = int(rng.lognormal(2.3, 0.8))
    spread = rng.uniform(15, 90)
    for _ in range(min(n_spots, 120)):
        sx, sy = cx + rng.normal(0, spread), cy + rng.normal(0, spread * rng.uniform(0.5, 1.0))
        r = float(np.clip(rng.lognormal(0.6, 0.6), 0.6, 18))
        strength = rng.uniform(0.25, 0.8) * (0.6 + 0.4 * min(r / 6, 1))
        R = int(r * 4 + 6)
        x0, x1 = int(max(0, sx - R)), int(min(W, sx + R + 1))
        y0, y1 = int(max(0, sy - R)), int(min(H, sy + R + 1))
        if x0 >= x1 or y0 >= y1:
            continue
        dx = xx[y0:y1, x0:x1] - sx + warp_x[y0:y1, x0:x1] * min(r / 4, 1.5)
        dy = yy[y0:y1, x0:x1] - sy + warp_y[y0:y1, x0:x1] * min(r / 4, 1.5)
        d = np.sqrt(dx * dx + dy * dy) / r
        spot = strength * (np.exp(-d ** 2 * 1.6) + 0.18 * np.exp(-(d / 2.6) ** 2))
        if r > 5 and rng.random() < 0.5:                   # larger spots: darker ring at the margin
            spot += 0.25 * strength * np.exp(-((d - 0.95) / 0.18) ** 2)
        fox[y0:y1, x0:x1] = 1 - (1 - fox[y0:y1, x0:x1]) * (1 - np.clip(spot, 0, 1))
# a scatter of isolated pin-prick spots everywhere
for _ in range(260):
    sx, sy = rng.uniform(0, W), rng.uniform(0, H)
    x0, x1, y0, y1 = int(max(0, sx - 4)), int(min(W, sx + 5)), int(max(0, sy - 4)), int(min(H, sy + 5))
    d2 = (xx[y0:y1, x0:x1] - sx) ** 2 + (yy[y0:y1, x0:x1] - sy) ** 2
    fox[y0:y1, x0:x1] = np.maximum(fox[y0:y1, x0:x1], rng.uniform(0.15, 0.5) * np.exp(-d2 / rng.uniform(0.6, 2.5)))


# ---- tide lines ----
def tide(cx, cy, rx, ry, rim_strength, inner_tone):
    # signed distance-like field of a warped ellipse: < 0 inside
    f = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2) - 1
    f = f + 0.12 * fbm([260, 120], 0.5) + 0.04 * fbm([55, 22], 0.5)
    px = f * min(rx, ry)                                      # roughly in pixels
    inside = 1 - smoothstep(-2, 2, px)
    rim = np.where(px > 0, np.exp(-(px / 1.3) ** 2), np.exp(-(px / 7.0) ** 2))   # sharp outer edge
    rim *= 0.25 + 0.75 * smoothstep(-1.2, 0.8, fbm([90, 30]))       # deposit thickness varies along the rim
    body = inside * inner_tone * (0.6 + 0.4 * smoothstep(-1, 1, fbm([70, 25])))
    return np.clip(rim * rim_strength + body, 0, 1), px


t1, _ = tide(W * 0.06, H * 0.93, W * 0.24, H * 0.36, 0.42, 0.07)
t1b, _ = tide(W * 0.06, H * 0.93, W * 0.19, H * 0.29, 0.22, 0.0)     # earlier, smaller wetting
t2, _ = tide(W * 0.80, H * -0.06, W * 0.13, H * 0.17, 0.30, 0.05)
tides = 1 - (1 - t1) * (1 - t1b) * (1 - t2)

stain = 1 - (1 - toning) * (1 - fox) * (1 - tides)
stain = np.clip(stain, 0, 1)
Image.fromarray((stain * 255 + 0.5).astype(np.uint8)).save(out)
layers = np.stack([toning, fox, tides], -1)
Image.fromarray((np.clip(layers, 0, 1) * 255 + 0.5).astype(np.uint8)).save(out.replace('.png', '_layers.png'))
print('stains written', out, 'mean', round(float(stain.mean()), 3), 'p99', round(float(np.percentile(stain, 99)), 3))
