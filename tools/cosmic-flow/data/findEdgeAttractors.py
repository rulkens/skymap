#!/usr/bin/env python3
"""One-off analysis script — NOT part of the runtime Cosmic Flow tool.

Find the velocity-convergence attractors near the box edges and name them.

'Attracts a lot of particles' in the advect viz means the velocity field is
*converging* there: div(v) < 0 (mass piling in) AND the local overdensity is
high. We score every voxel by (-divergence) * relu(delta), suppress the central
local-volume knot, keep the peaks whose distance is large (near the cube faces),
reverse-map each through the SAME verified transform the labels use, and match
RA/Dec/dist against a hand list of the major superclusters.

Verified transform (from the earlier cross-match): grid spatial axes are
(SGX,SGY,SGZ) identity, all positive, center at index 63.5, voxel = 1000/128
Mpc/h, physical distance divides by Hubble h≈0.77.
"""
import numpy as np

SRC = "data/raw/cf4pp/CF4pp_mean_std_grids.npz"
H = 0.77
VOX = 1000.0 / 128.0  # Mpc/h per voxel
CEN = 63.5

z = np.load(SRC)
v = z["v_mean_CF4pp"].astype(np.float32)          # (3,N,N,N)
if v.shape[0] == 3:
    v = np.moveaxis(v, 0, -1)                       # (N,N,N,3) axes=(i,j,k)=(SGX,SGY,SGZ)
delta = z["d_mean_CF4pp"].astype(np.float32)        # (N,N,N)
N = delta.shape[0]

# divergence in voxel units (sign only matters for ranking)
dvx = np.gradient(v[..., 0], axis=0)
dvy = np.gradient(v[..., 1], axis=1)
dvz = np.gradient(v[..., 2], axis=2)
div = dvx + dvy + dvz
conv = np.clip(-div, 0, None)                       # convergence
score = conv * np.clip(delta, 0, None)

# physical distance of every voxel from us (center)
ii, jj, kk = np.meshgrid(np.arange(N), np.arange(N), np.arange(N), indexing="ij")
sgx = (ii - CEN) * VOX / H
sgy = (jj - CEN) * VOX / H
sgz = (kk - CEN) * VOX / H
dist = np.sqrt(sgx**2 + sgy**2 + sgz**2)

# --- inverse transform SG-cartesian -> RA/Dec (ICRS) ---
R_G = np.array([[-0.0548755604, -0.8734370902, -0.4838350155],
                [ 0.4941094279, -0.4448296300,  0.7469822445],
                [-0.8676661490, -0.1980763734,  0.4559837762]])
R_SG = np.array([[-0.7357425748, 0.6772612964, 0.0],
                 [-0.0745537783, -0.0809914713, 0.9939225904],
                 [ 0.6731453021, 0.7312711105, 0.1100812622]])
R = R_SG @ R_G            # ICRS-cartesian -> SG-cartesian
Rinv = R.T


def radec(sgv):
    icrs = Rinv @ sgv
    icrs = icrs / np.linalg.norm(icrs)
    ra = np.degrees(np.arctan2(icrs[1], icrs[0])) % 360.0
    dec = np.degrees(np.arcsin(np.clip(icrs[2], -1, 1)))
    return ra, dec


# major superclusters / attractors (RA, Dec, approx dist Mpc)
CATALOG = [
    ("Virgo",            187.7,  12.4,  16),
    ("Centaurus",        192.2, -41.3,  45),
    ("Great Attractor",  243.6, -60.8,  65),
    ("Hydra",            159.2, -27.5,  50),
    ("Perseus-Pisces",    49.9,  41.5,  73),
    ("Coma",             195.0,  28.0,  99),
    ("Hercules",         241.3,  17.8, 160),
    ("Shapley",          202.0, -31.5, 200),
    ("Horologium-Retic", 49.0,  -50.0, 210),
    ("Pavo-Indus",       310.4, -48.6, 205),
    ("Columba",           84.7, -48.2, 217),
    ("Bootes",           210.0,  30.0, 270),
    ("Corona Borealis",  232.0,  28.0, 290),
    ("Vela",             140.0, -45.0, 265),
    ("Sloan Great Wall", 200.0,  10.0, 300),
    ("Saraswati",         24.0,  17.0, 600),
]


def ang_sep(ra1, dec1, ra2, dec2):
    r1, d1, r2, d2 = map(np.radians, (ra1, dec1, ra2, dec2))
    c = np.sin(d1) * np.sin(d2) + np.cos(d1) * np.cos(d2) * np.cos(r1 - r2)
    return np.degrees(np.arccos(np.clip(c, -1, 1)))


def best_match(ra, dec, d):
    best, bs = None, 1e9
    for name, cra, cdec, cd in CATALOG:
        a = ang_sep(ra, dec, cra, cdec)
        # combine angular + fractional distance error
        s = a + 30.0 * abs(d - cd) / max(cd, 50)
        if s < bs:
            bs, best = s, (name, a, cd)
    return best


# suppress the central knot so edge peaks surface
EDGE_MIN = 250.0   # Mpc — "way out toward the edge"
mask = dist >= EDGE_MIN
sc = np.where(mask, score, 0.0)

# greedy non-max suppression: pick top voxels, skip any within 12 voxels of one taken
flat = np.argsort(sc, axis=None)[::-1]
taken = []
SUPPRESS = 12
for idx in flat[:20000]:
    i, j, k = np.unravel_index(idx, sc.shape)
    if sc[i, j, k] <= 0:
        break
    if any(abs(i - ti) < SUPPRESS and abs(j - tj) < SUPPRESS and abs(k - tk) < SUPPRESS
           for ti, tj, tk in taken):
        continue
    taken.append((i, j, k))
    if len(taken) >= 12:
        break

print(f"N={N}  edge cut={EDGE_MIN} Mpc  H={H}")
print(f"{'rank':>4} {'dist':>5} {'RA':>6} {'Dec':>6} {'delta':>6} {'conv':>6}  match (sep, catDist)")
for r, (i, j, k) in enumerate(taken, 1):
    sgv = np.array([sgx[i, j, k], sgy[i, j, k], sgz[i, j, k]])
    ra, dec = radec(sgv)
    d = dist[i, j, k]
    name, sep, cd = best_match(ra, dec, d)
    print(f"{r:>4} {d:5.0f} {ra:6.1f} {dec:6.1f} {delta[i,j,k]:6.2f} {conv[i,j,k]:6.1f}  "
          f"{name} ({sep:.0f}deg, {cd}Mpc)")
