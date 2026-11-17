"""Cut an engraved cartouche from a hand-coloured map scan as an ink-alpha sprite (RGB black, A = ink).
usage: extract_engraving.py <scan.jpg> <out.png> <spec.json> [preview.png]  (see README.md)"""
import sys, json
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
Image.MAX_IMAGE_PIXELS = None

src, out, spec = sys.argv[1], sys.argv[2], json.load(open(sys.argv[3]))
x0, y0, x1, y1 = spec['crop']
im = np.asarray(Image.open(src).convert('RGB').crop((x0, y0, x1, y1))).astype(np.float32) / 255
# Max channel: a colourist's wash reads as paper, only the engraved line as ink.
lum = im.max(axis=2)
bg = ndi.gaussian_filter(ndi.maximum_filter(lum, size=spec.get('bgSize', 41)), 12)
ink = np.clip(1 - lum / np.maximum(bg, 1e-3), 0, 1)
lo, hi = spec.get('push', [0.12, 0.45])
raw = ink
ink = np.clip((raw - lo) / (hi - lo), 0, 1)
h, w = ink.shape
binary = ink > 0.3
if 'inkPush' in spec:
    ilo, ihi = spec['inkPush']
    ink = np.clip((raw - ilo) / (ihi - ilo), 0, 1)

def disc(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r

# The body: hatching closed into masses, thin ruled lines (rhumbs, graticule) opened away.
core = ndi.binary_opening(binary, disc(spec.get('core', 0))) if spec.get('core') else binary
body = ndi.binary_closing(core, disc(spec.get('close', 8)))
body = ndi.binary_fill_holes(body)
body = ndi.binary_opening(body, disc(spec.get('open', 6)))
lab, n = ndi.label(body)
sizes = ndi.sum(body, lab, range(1, n + 1))
keep = np.isin(lab, 1 + np.flatnonzero(sizes >= spec.get('minArea', 4000)))
keep = ndi.binary_dilation(keep, disc(spec.get('grow', 5)))
if spec.get('force'):
    fm = Image.new('L', (w, h), 0); df = ImageDraw.Draw(fm)
    for poly in spec['force']:
        df.polygon([tuple(q) for q in poly], fill=255)
    keep = keep | (np.asarray(fm) > 0)
mask = Image.new('L', (w, h), 0)
d = ImageDraw.Draw(mask)
if 'keep' in spec:
    for poly in spec['keep']:
        d.polygon([tuple(p) for p in poly], fill=255)
else:
    d.rectangle((0, 0, w, h), fill=255)
for poly in spec.get('erase', []):
    d.polygon([tuple(p) for p in poly], fill=0)
for e in spec.get('eraseEllipse', []):
    cx, cy, rx, ry = e
    d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=0)
for r in spec.get('eraseRect', []):
    d.rectangle(tuple(r), fill=0)
m = np.asarray(mask) > 0
ink = ink * (keep & m)
# Drop specks left by the cut.
lab, n = ndi.label(ink > 0.2)
sizes = ndi.sum(ink > 0.2, lab, range(1, n + 1))
ink = ink * (np.isin(lab, 1 + np.flatnonzero(sizes >= spec.get('minSpeck', 12))) | (ink <= 0.2))
ys, xs = np.nonzero(ink > 0.05)
pad = 2
ink = ink[max(0, ys.min() - pad):ys.max() + pad + 1, max(0, xs.min() - pad):xs.max() + pad + 1]
print('trim offset', max(0, xs.min() - pad), max(0, ys.min() - pad), 'size', ink.shape[::-1])
img = Image.fromarray((ink * 255).astype(np.uint8), 'L')
scale = spec.get('outWidth', 1024) / img.width
img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
if spec.get('eraseOut'):
    em = Image.new('L', img.size, 255); de = ImageDraw.Draw(em)
    for poly in spec['eraseOut']:
        de.polygon([tuple(q) for q in poly], fill=0)
    img = Image.fromarray((np.asarray(img).astype(np.float32) * (np.asarray(em) / 255)).astype(np.uint8), 'L')
rgba = Image.new('RGBA', img.size, (0, 0, 0, 0)); rgba.putalpha(img)
rgba.save(out)
print('out', img.size, 'scale', scale)
if len(sys.argv) > 4:
    prev = Image.new('RGB', img.size, (240, 232, 214)); prev.paste((30, 20, 10), (0, 0), img)
    prev.save(sys.argv[4])
