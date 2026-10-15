# PROTOTYPE stellar-stream particle builder — see README.md.
# usage: python3 -I buildStellarStreams.py <galstreams package dir> public/data/stellar_streams.bin
# Output: float32 records [x,y,z (Mpc, heliocentric ICRS), tx,ty,tz (unit tangent), size (Mpc), lum, colour t, stream id]
import numpy as np, json, sys, glob, os
rng = np.random.default_rng(7)
G_DIR = sys.argv[1]
OUT = sys.argv[2]

# ---- frames -----------------------------------------------------------------
R0, ZSUN = 8.178, 0.0208
# ICRS -> Galactic rotation (Hipparcos/ESA 1997)
A_G = np.array([[-0.0548755604, -0.8734370902, -0.4838350155],
                [+0.4941094279, -0.4448296300, +0.7469822445],
                [-0.8676661490, -0.1980763734, +0.4559837762]])
VSUN = np.array([12.9, 245.6, 7.78])
K = 4.74047

def radec_xyz(ra, dec, d):
    ra, dec = np.radians(ra), np.radians(dec)
    return np.stack([d*np.cos(dec)*np.cos(ra), d*np.cos(dec)*np.sin(ra), d*np.sin(dec)], -1)

def icrs_to_gc(xyz):           # kpc heliocentric ICRS -> galactocentric (Sun at -R0)
    g = xyz @ A_G.T
    return g + np.array([-R0, 0, ZSUN])

def gc_to_icrs(X):
    g = X - np.array([-R0, 0, ZSUN])
    return g @ A_G

# ---- potential (gala MilkyWayPotential, Bovy 2015 flavour) -------------------
GK = 4.30091e-6
def acc(x):
    r = np.linalg.norm(x, axis=-1, keepdims=True)
    a = np.zeros_like(x)
    for m, c in ((1.71e9, 0.07), (5.0e9, 1.0)):     # nucleus, bulge (Hernquist)
        a -= GK*m/(r*(r+c)**2) * x
    m, ad, bd = 6.8e10, 3.0, 0.28                      # disc (Miyamoto-Nagai)
    R2 = x[..., :1]**2 + x[..., 1:2]**2
    zb = np.sqrt(x[..., 2:3]**2 + bd**2)
    den = (R2 + (ad+zb)**2)**1.5
    a[..., :2] -= GK*m*x[..., :2]/den
    a[..., 2:3] -= GK*m*x[..., 2:3]*(ad+zb)/(zb*den)
    m, rs = 5.4e11, 15.62                              # halo (NFW)
    s = r/rs
    a -= GK*m*(np.log1p(s) - s/(1+s))/r**3 * x
    return a

def leapfrog(x, v, dt, n, cb=None):
    a = acc(x)
    for i in range(n):
        v = v + 0.5*dt*a; x = x + dt*v; a = acc(x); v = v + 0.5*dt*a
        if cb: x, v, a = cb(i, x, v, a)
    return x, v

# ---- Sagittarius particle spray (Fardal+2015 style) ---------------------------
def sgr_spray():
    ra, dec, d, pmra, pmdec, rv = 283.764, -30.480, 26.0, -2.692, -1.359, 142.0
    p = radec_xyz(ra, dec, d)
    rhat = p/np.linalg.norm(p)
    ra_r, dec_r = np.radians(ra), np.radians(dec)
    e_ra = np.array([-np.sin(ra_r), np.cos(ra_r), 0])
    e_de = np.array([-np.sin(dec_r)*np.cos(ra_r), -np.sin(dec_r)*np.sin(ra_r), np.cos(dec_r)])
    v_icrs = rv*rhat + K*d*(pmra*e_ra + pmdec*e_de)
    X = icrs_to_gc(p); V = v_icrs @ A_G.T + VSUN
    dt, T = 0.001/0.9778, 3.5/0.9778              # 1 Myr steps over 3.5 Gyr (time unit kpc/(km/s))
    n = int(T/dt)
    # integrate progenitor backwards, record orbit forwards
    xs = np.empty((n+1, 3)); vs = np.empty((n+1, 3))
    x, v = X.copy()[None], V.copy()[None]
    xs[n], vs[n] = x[0], v[0]
    a = acc(x)
    for i in range(n):
        v = v - 0.5*dt*a; x = x - dt*v; a = acc(x); v = v - 0.5*dt*a
        xs[n-1-i], vs[n-1-i] = x[0], v[0]
    # progenitor mass declines as it is stripped
    m0, m1 = 1.0e9, 3.0e8
    per = 6
    parts_x, parts_v, born = [], [], []
    for i in range(0, n, 1):
        if i % 1: continue
        xp, vp = xs[i], vs[i]
        r = np.linalg.norm(xp); L = np.cross(xp, vp); Om = np.linalg.norm(L)/r**2
        m = m0 + (m1-m0)*i/n
        # d2Phi/dr2 by finite difference
        h = 1e-3; rh = xp/r
        g1 = -acc((xp + h*rh)[None])[0] @ rh; g0 = -acc((xp - h*rh)[None])[0] @ rh
        d2 = (g1-g0)/(2*h)
        rt = (GK*m/abs(Om**2 - d2))**(1/3)
        xh = rh; zh = L/np.linalg.norm(L); yh = np.cross(zh, xh)
        for sgn in (-1, 1):
            k = per
            kr = rng.normal(2.0, 0.5, k); kz = rng.normal(0, 0.5, k)
            kvp = rng.normal(0.3, 0.5, k); kvz = rng.normal(0, 0.5, k)
            dx = sgn*kr*rt
            px = xp + dx[:, None]*xh + (kz*rt)[:, None]*zh
            pv = vp + (sgn*kvp*kr*rt*Om)[:, None]*yh + (kvz*rt*Om)[:, None]*zh
            parts_x.append(px); parts_v.append(pv); born.append(np.full(k, i))
    PX = np.concatenate(parts_x); PV = np.concatenate(parts_v); B = np.concatenate(born)
    # integrate each particle from its birth step to now (vectorised: inactive ones ride the progenitor)
    x = PX.copy(); v = PV.copy(); a = acc(x)
    order = np.argsort(B); PX, PV, B = PX[order], PV[order], B[order]
    x = np.zeros_like(PX); v = np.zeros_like(PV); active = 0
    pos_born = np.searchsorted(B, np.arange(n+1), side='right')
    for i in range(n):
        new = pos_born[i]
        if new > active:
            x[active:new] = PX[active:new]; v[active:new] = PV[active:new]; active = new
        xa, va = x[:active], v[:active]
        aa = acc(xa); va += 0.5*dt*aa; xa += dt*va; aa = acc(xa); va += 0.5*dt*aa
    print('sgr particles', active, 'progenitor now', xs[n])
    age = (n - B[:active])/n
    return x[:active], v[:active], age, xs[n]

sx, sv, sage, sprog = sgr_spray()

# ---- galstreams tracks --------------------------------------------------------
def load(f):
    rows = [l for l in open(f) if not l.startswith('#')]
    return np.genfromtxt(rows[1:], delimiter=',')

def pick_tracks(G):
    """One track per stream: the master-log 'On' track when it carries real distances, else any that does."""
    def summ(f):
        rows = [l.strip() for l in open(f) if not l.startswith('#')]
        return dict(zip(rows[0].split(','), rows[1].split(',')))
    onset = set()
    for l in open(G + '/lib/master_log.txt'):
        if l.startswith('#'): continue
        s = l.split()
        if s[1] == '1': onset.add((s[3], s[4]))
    by = {}
    for f in sorted(glob.glob(G + '/tracks/track.*.ecsv')):
        if f.endswith('summary.ecsv'): continue
        base = os.path.basename(f); kind, ref = base.split('.')[1], base.split('.')[3]
        name = summ(f.replace('.ecsv', '.summary.ecsv'))['StreamName']
        d = load(f)[:, 2]
        if np.allclose(d, 1.0, atol=1e-6): continue   # placeholder distance: sky track only
        by.setdefault(name, []).append(dict(name=name, file=base, kind=kind, ref=ref))
    return [next((t for t in ts if (n, t['ref']) in onset), ts[0]) for n, ts in by.items()]
widths = {}
for l in open(G_DIR + '/lib/master_log.txt'):
    if l.startswith('#'): continue
    s = l.split()
    try: widths[s[3]] = float(s[8])
    except: pass
picked = pick_tracks(G_DIR)
recs = []
names = ['Sagittarius']
def emit(Xgc, T, size_kpc, lum, ctint, sid):
    p = gc_to_icrs(Xgc)/1000.0
    t = T @ A_G
    t /= np.linalg.norm(t, axis=1, keepdims=True) + 1e-12
    n = len(p)
    recs.append(np.column_stack([p, t, np.full(n, size_kpc/1000.0) if np.isscalar(size_kpc) else size_kpc/1000.0,
                                 lum, ctint, np.full(n, sid)]).astype(np.float32))

# Sagittarius: luminosity higher for young debris; tint redder (metal-richer)
n = len(sx)
emit(sx, sv, rng.uniform(0.25, 0.6, n), 1.0*(0.6+0.8*(1-sage)), rng.uniform(0.55, 1.0, n), 0)
# Sgr core (bound remnant) — dense knot
core = sprog + rng.normal(0, 0.6, (4000, 3))*np.array([1, 0.4, 0.4])
emit(core, np.tile(sv.mean(0), (4000, 1)), rng.uniform(0.2, 0.5, 4000), np.full(4000, 1.6), rng.uniform(0.6, 1.0, 4000), 0)

def motion_sign(a):
    """+1 if the track's point order follows its proper motions (rv taken as 0 where missing), -1 if
    against, 0 when the track carries no motions."""
    pm = np.isfinite(a[:, 3:5]).all(1)
    if pm.sum() < 2: return 0
    ra, dec = np.radians(a[:, 0]), np.radians(a[:, 1])
    e_ra = np.stack([-np.sin(ra), np.cos(ra), 0*ra], -1)
    e_de = np.stack([-np.sin(dec)*np.cos(ra), -np.sin(dec)*np.sin(ra), np.cos(dec)], -1)
    p = radec_xyz(a[:, 0], a[:, 1], a[:, 2])
    rv = np.where(np.isfinite(a[:, 5]), a[:, 5], 0.0)
    v = rv[:, None]*p/np.linalg.norm(p, axis=1, keepdims=True) + K*a[:, 2:3]*(a[:, 3:4]*e_ra + a[:, 4:5]*e_de)
    vgc = v @ A_G.T + VSUN
    tan = np.diff(icrs_to_gc(p), axis=0)
    dots = (tan*vgc[:-1]).sum(1)[pm[:-1]]
    return 1 if dots.sum() >= 0 else -1

oriented = {1: 0, -1: 0, 0: 0}
for sid, t in enumerate(picked, start=1):
    if t['name'] == 'Sagittarius' or t['kind'] not in ('st',): continue
    a = load(G_DIR + '/tracks/' + t['file'])
    a = a[np.isfinite(a[:, :3]).all(1)]
    # Track files run in survey order, not orbital order: flip to the stars' motion.
    sign = motion_sign(a)
    oriented[sign] += 1
    if sign < 0: a = a[::-1]
    P = icrs_to_gc(radec_xyz(a[:, 0], a[:, 1], a[:, 2]))
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    L = seg.sum()
    if L < 0.5: continue
    names.append(t['name'])
    w_deg = widths.get(t['name'], 0.3)
    if not np.isfinite(w_deg) or w_deg <= 0: w_deg = 0.3
    dmean = np.median(a[:, 2])
    w_kpc = max(0.03, np.radians(w_deg)*dmean)
    nump = int(np.clip(L*60*max(1.0, w_kpc/0.3), 300, 30000))
    s = np.concatenate([[0], np.cumsum(seg)])
    u = np.sort(rng.uniform(0, L, nump))
    idx = np.clip(np.searchsorted(s, u) - 1, 0, len(seg)-1)
    f = ((u - s[idx])/np.maximum(seg[idx], 1e-9))[:, None]
    base = P[idx]*(1-f) + P[idx+1]*f
    tan = P[idx+1] - P[idx]
    tan /= np.linalg.norm(tan, axis=1, keepdims=True) + 1e-12
    # perpendicular gaussian scatter + gentle along-track density waves (epicyclic clumps)
    off = rng.normal(0, w_kpc, (nump, 3)); off -= (off*tan).sum(1, keepdims=True)*tan
    pos = base + off
    phase = u/L
    clump = 0.55 + 0.45*np.sin(2*np.pi*(phase*rng.uniform(4, 9) + rng.uniform())) ** 2
    endfade = np.clip(np.minimum(phase, 1-phase)*8, 0, 1)
    lum = clump*endfade*rng.uniform(0.5, 1.0, nump) * 0.8
    emit(pos, tan, np.full(nump, float(np.clip(w_kpc*0.8, 0.05, 0.3))), lum, rng.uniform(0.0, 0.6, nump), sid)

R = np.concatenate(recs)
R.tofile(OUT)
json.dump(names, open(OUT + '.names.json', 'w'))
print('records', len(R), 'streams', len(names), 'bytes', R.nbytes)
print('track order vs motion: kept', oriented[1], 'flipped', oriented[-1], 'no motions', oriented[0])
