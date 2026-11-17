"""Restores the Cetus head's outline and horn in data/antique/sprites/cetus.png from Hevelius' scan.

The first hand cut dropped the thin outer contour of the head (snout crown, horn edge and tip, the
crest line) and half of the crown's dark hatching. This reads the same engraving back from the scan,
registered to the sprite on the head (scale 1.015, offset from a correlation fit), and adds it:
  - a ring just outside and inside the sprite's silhouette gets the scan's ink;
  - the snout/horn box is replaced by the scan's ink, with the star symbol and the plate's ruled
    parallel there filled from neighbouring engraving (exemplar_inpaint.py), not drawn.
Usage (python3 -I; numpy scipy scikit-image Pillow): restore_cetus_head.py <scan.jpg> <sprite.png> [out.png]
Scan: "Cetus (Uranographia Hevelius).jpg" on Commons (PROVENANCE.md); crop [688,98,4278,2827].
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import morphology as mo

sys.path.insert(0, __import__("os").path.dirname(__file__))
from exemplar_inpaint import inpaint

Image.MAX_IMAGE_PIXELS = None
CROP = (688, 98, 4278, 2827)
S2 = 2 * 1024 / 3590  # working scale: twice the sprite's
SX, SY, DX, DY = 1.015, 1.0166, 2.375, -10.0  # sprite2x = scan2x * scale + offset, fitted on the head
BOX = (1300, 0, 2048, 700)  # head region, sprite 2x pixels
SNOUT = (1895, 185, 2045, 480)  # x0, y0, x1, y1
STARS = [(1838, 220, 27), (1947, 270, 27), (1900, 458, 30), (1897, 54, 27)]
RULE_ROWS = (268, 280)  # the plate's ruled parallel across the snout
PAPER = 0.14
SPUR = (1550, 60, 1566, 84)  # leftover colure stub at the crest


def scan_ink(path):
    g = Image.open(path).convert("L").crop(CROP)
    g = np.asarray(g.resize((round(3590 * S2), round(2729 * S2)), Image.LANCZOS), float)
    bg = ndi.gaussian_filter(ndi.maximum_filter(ndi.gaussian_filter(g, 3), size=40), 16)
    return np.clip((1 - g / bg) * 2.2, 0, 1)


def main():
    scan, spr_path = sys.argv[1], sys.argv[2]
    out = sys.argv[3] if len(sys.argv) > 3 else spr_path
    spr = Image.open(spr_path).convert("RGBA")
    a1 = np.asarray(spr.getchannel("A"), float) / 255
    a2 = np.asarray(spr.getchannel("A").resize((2048, 1540), Image.LANCZOS), float) / 255
    ink = scan_ink(scan)
    x0, y0, x1, y1 = BOX
    yy, xx = np.mgrid[y0:y1, x0:x1]
    m = ndi.map_coordinates(ink, [(yy - DY) / SY, (xx - DX) / SX], order=1, cval=0)
    t = a2[y0:y1, x0:x1]

    star = np.zeros(m.shape, bool)
    for cx, cy, r in STARS:
        star |= (xx - cx) ** 2 + (yy - cy) ** 2 < r * r
    rule = mo.opening(m > 0.25, np.ones((1, 45)))
    rule = mo.dilation(rule, np.ones((3, 1)))
    rule[: RULE_ROWS[0] - y0] = False
    rule[RULE_ROWS[1] - y0 :] = False

    sil = ndi.binary_fill_holes(mo.closing(t > 0.3, mo.disk(10)))
    ring = mo.dilation(sil, mo.disk(18)) & ~mo.erosion(sil, mo.disk(6))
    ring &= ~star & ~rule
    ring[SPUR[1] - y0 : SPUR[3] - y0, SPUR[0] - x0 : SPUR[2] - x0] = False
    patch = m * ring
    lab, n = ndi.label(patch > 0.2, np.ones((3, 3)))
    sizes = ndi.sum(patch > 0.2, lab, range(1, n + 1))
    patch *= np.isin(lab, 1 + np.flatnonzero(sizes >= 60))

    # snout and horn: all of the scan's ink, the star and the rule filled from the engraving around them
    sx0, sy0, sx1, sy1 = SNOUT
    bad = star | rule
    bad[:, : sx0 - x0] = bad[:, sx1 - x0 :] = False
    donor_ok = ~mo.dilation(rule | star, mo.disk(6))
    fill = inpaint(m, bad & ((xx >= sx0) & (xx < sx1)), donor_ok)
    fill = np.clip((fill - PAPER) / (1 - PAPER), 0, 1)  # paper mottling reads ~0.1 in the flattened scan
    lab, n = ndi.label(fill > 0.15, np.ones((3, 3)))
    sizes = ndi.sum(fill > 0.15, lab, range(1, n + 1))
    fill *= np.isin(lab, 1 + np.flatnonzero(sizes >= 40))
    box = np.zeros(m.shape, float)
    ys, xs = slice(sy0 - y0, sy1 - y0), slice(sx0 - x0, sx1 - x0)
    box[ys, xs] = 1
    box = ndi.gaussian_filter(box, 3)

    full = np.zeros((1540, 2048))
    full[y0:y1, x0:x1] = np.clip(patch * 1.15, 0, 1) * (1 - box) + np.clip(fill * 1.1, 0, 1) * box
    a2n = np.asarray(Image.fromarray((full * 255).astype("uint8")).resize((1024, 770), Image.BOX), float) / 255
    # inside the snout box the scan replaces the first cut's ink; elsewhere the new ink only adds
    keep = np.ones_like(a1)
    keep[sy0 // 2 + 2 : sy1 // 2 - 2, sx0 // 2 + 2 : sx1 // 2 - 2] = 0
    res = np.maximum(a1 * keep, a2n)
    o = Image.new("RGBA", spr.size, (0, 0, 0, 0))
    o.putalpha(Image.fromarray((np.clip(res, 0, 1) * 255 + 0.5).astype("uint8")))
    o.save(out)


main()
