"""Build a tileable aged-laid-paper albedo from blank margins of 1687 Rijksmuseum (CC0) scans.

usage: build_albedo.py <src_dir> <out_dir> [size=2048] [seed=7]

Pipeline: crop ink-free margin strips -> sRGB->linear -> divide each channel by a wide Gaussian
(kills scanner falloff, toning, stains; keeps fibres, laid lines, inclusions) -> rescale to the
pooled median colour -> toroidal image quilting (Efros & Freeman 2001, min-error boundary cuts,
wrap-around so the tile is seamless); finish_paper.py turns it into the final albedo + height.
"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None
src_dir, out_dir = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 2048
rng = np.random.default_rng(int(sys.argv[4]) if len(sys.argv) > 4 else 7)

# (file, x0, y0, x1, y1) in source pixels: blank paper only, clear of the plate mark, centre fold,
# sheet edges, the museum stamp and the pencilled sheet numbers.
STRIPS = [
    ('rijnland3.jpg', 260, 3830, 2700, 4490), ('rijnland3.jpg', 2950, 3830, 5150, 4490),
    ('rijnland3.jpg', 260, 170, 2700, 740), ('rijnland3.jpg', 2950, 170, 5250, 740),
    ('rijnland1.jpg', 260, 3840, 2700, 4490), ('rijnland1.jpg', 2950, 3840, 5150, 4490),
    ('rijnland1.jpg', 260, 170, 2650, 720), ('rijnland1.jpg', 3000, 170, 5250, 720),
]


def to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


cache = {}
strips = []
for f, x0, y0, x1, y1 in STRIPS:
    if f not in cache:
        cache[f] = np.asarray(Image.open(os.path.join(src_dir, f)).convert('RGB'), dtype=np.float32) / 255
    s = to_lin(cache[f][y0:y1, x0:x1])
    # Wide blur in reflect mode so the strip borders do not darken; sigma ~ 15 mm at ~8.4 px/mm.
    low = np.stack([ndimage.gaussian_filter(s[..., k], 120, mode='reflect') for k in range(3)], -1)
    strips.append(s / low)
target = np.median(np.concatenate([to_lin(cache[f][y0:y1, x0:x1]).reshape(-1, 3) for f, x0, y0, x1, y1 in STRIPS]), 0)
strips = [s * target for s in strips]
print('target linear colour', target, 'srgb', (to_srgb(target) * 255).round())

# ---- toroidal quilting -------------------------------------------------------------------------
S, O = 256, 64          # block step and overlap; patch P = S + O; N must be a multiple of S
P = S + O
nb = N // S
assert nb * S == N
out = np.zeros((N, N, 3), np.float32)
filled = np.zeros((N, N), bool)
areas = np.array([(s.shape[0] - P) * (s.shape[1] - P) for s in strips], float)
K = 500


def min_cut_vertical(e):
    """e: (H, W) error; returns per-row column index of the cheapest top-to-bottom seam."""
    H, W = e.shape
    cost = e.copy()
    for y in range(1, H):
        prev = cost[y - 1]
        best = np.minimum(prev, np.minimum(np.r_[np.inf, prev[:-1]], np.r_[prev[1:], np.inf]))
        cost[y] += best
    path = np.empty(H, int)
    path[-1] = int(np.argmin(cost[-1]))
    for y in range(H - 2, -1, -1):
        x = path[y + 1]
        lo, hi = max(0, x - 1), min(W, x + 2)
        path[y] = lo + int(np.argmin(cost[y, lo:hi]))
    return path


for bi in range(nb):
    for bj in range(nb):
        rows = (bi * S + np.arange(P)) % N
        cols = (bj * S + np.arange(P)) % N
        fp_filled = filled[np.ix_(rows, cols)]
        fp_old = out[np.ix_(rows, cols)]
        m = fp_filled
        # sample candidates
        which = rng.choice(len(strips), K, p=areas / areas.sum())
        cands = np.empty((K, P, P, 3), np.float32)
        for k, w in enumerate(which):
            s = strips[w]
            y = rng.integers(0, s.shape[0] - P)
            x = rng.integers(0, s.shape[1] - P)
            cands[k] = s[y:y + P, x:x + P]
        if m.any():
            err = ((cands[:, m] - fp_old[m]) ** 2).sum(axis=(1, 2))
            ok = np.flatnonzero(err <= err.min() * 1.08)
            pick = cands[rng.choice(ok)]
        else:
            pick = cands[0]
        e = ((pick - fp_old) ** 2).sum(-1)
        use_new = np.ones((P, P), bool)
        if fp_filled[:, :O].all():          # left overlap: old on the left of the seam
            p = min_cut_vertical(e[:, :O])
            use_new[:, :O] &= np.arange(O)[None, :] >= p[:, None]
        if fp_filled[:, -O:].all():         # right overlap (wrap to column 0): old on the right
            p = min_cut_vertical(e[:, -O:])
            use_new[:, -O:] &= np.arange(O)[None, :] <= p[:, None]
        if fp_filled[:O, :].all():          # top overlap
            p = min_cut_vertical(e[:O, :].T)
            use_new[:O, :] &= (np.arange(O)[:, None] >= p[None, :])
        if fp_filled[-O:, :].all():         # bottom overlap (wrap to row 0)
            p = min_cut_vertical(e[-O:, :].T)
            use_new[-O:, :] &= (np.arange(O)[:, None] <= p[None, :])
        use_new |= ~fp_filled
        # 1-px feather along the seam only: wider feathers visibly drop fibre contrast (Heitz & Neyret).
        a = ndimage.gaussian_filter(use_new.astype(np.float32), 0.8)
        a = np.where(fp_filled, a, 1.0)[..., None]
        out[np.ix_(rows, cols)] = a * pick + (1 - a) * fp_old
        filled[np.ix_(rows, cols)] = True
    print('row', bi, 'done', flush=True)

albedo_lin = out
Image.fromarray((to_srgb(albedo_lin) * 255 + 0.5).astype(np.uint8)).save(os.path.join(out_dir, 'quilt_albedo.png'))
print('done')
