"""Erase thin ruled-line ink (strokes under 5 px wide) inside hand-placed boxes of the strapwork sprite.
usage: erase_rule_boxes.py <in.png> <out.png> <diff.png>  (see README.md)"""
import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
BOXES = [  # x0, y0, x1, y1 in sprite px: Ortelius' graticule left in the strapwork's gaps
    (836, 165, 933, 177), (987, 165, 1006, 177), (953, 90, 974, 139),           # top right
    (864, 431, 906, 440), (988, 430, 1024, 441), (905, 413, 914, 458),         # loop + right of roll
    (865, 445, 920, 510), (990, 434, 1024, 476), (866, 518, 979, 528),
    (938, 518, 959, 536), (970, 334, 985, 352), (796, 448, 817, 486),
    (780, 590, 799, 610), (855, 561, 864, 569),
    (6, 166, 19, 175), (76, 166, 84, 175), (158, 166, 172, 175), (178, 32, 194, 41),  # top left
    (0, 280, 14, 310), (54, 516, 92, 536), (11, 429, 21, 436), (11, 453, 18, 462),
    (132, 517, 143, 530), (248, 519, 262, 526),
    (613, 54, 627, 70), (502, 0, 509, 7),                                         # crest
    (668, 524, 762, 533), (578, 558, 632, 566), (398, 558, 416, 566),             # bottom
]
src, out, diff = sys.argv[1:4]
a = np.asarray(Image.open(src)).astype(np.float32); ink = a[..., 3] / 255
b = ink > 0.3
cross = ndi.generate_binary_structure(2, 1)
disc2 = np.add.outer(np.arange(-2, 3) ** 2, np.arange(-2, 3) ** 2) <= 4
thick = ndi.binary_dilation(ndi.binary_opening(b, disc2), cross)
box = np.zeros_like(b)
for x0, y0, x1, y1 in BOXES:
    box[y0:y1, x0:x1] = True
cut = box & ~thick & (ink > 0.02)
o = a.copy(); o[..., 3] = np.where(cut, 0, a[..., 3])
Image.fromarray(o.astype(np.uint8), 'RGBA').save(out)
h, w = b.shape
prev = np.full((h, w, 3), [245, 238, 220], np.float32)
prev = prev * (1 - ink[..., None]) + np.array([30, 20, 10]) * ink[..., None]
prev[cut & (ink > 0.1)] = [220, 30, 30]
Image.fromarray(prev.astype(np.uint8)).save(diff)
print('cut px', int((cut & (ink > 0.1)).sum()))
