"""Bridges the two breaks in data/antique/sprites/seaSerpent.png with drawn hatching.

Where Hevelius drew Crater's foot and Corvus's claws over the Hydra, extraction removed
them and the serpent's body was left in pieces. This redraws the hidden stretch as parallel
engraver's strokes across the body, in the sprite's own alpha-ink (RGB stays black):
  1. the coil: a wedge at (510..565, 156..183) joining the fold to the descending body;
  2. the tail: a strip along (748,118)->(800,72), over the scan's lettering remnants.
Usage (python3 -I; numpy not needed): repair_serpent.py <sprite.png> [out.png]
Run once on the committed sprite; strokes are hand-placed, so it is not a re-extraction.
"""
import math
import random
import sys

from PIL import Image, ImageChops, ImageDraw

SS = 4  # supersample for antialiased 1 px strokes


def strokes(size, poly, axis, spacing, alpha_lo, alpha_hi, edge_alpha, edges):
    """Hatching across `poly`, perpendicular to `axis`, darker towards the lower edge."""
    w, h = size
    layer = Image.new("L", (w * SS, h * SS), 0)
    mask = Image.new("L", (w * SS, h * SS), 0)
    ImageDraw.Draw(mask).polygon([(x * SS, y * SS) for x, y in poly], fill=255)
    d = ImageDraw.Draw(layer)
    ax, ay = axis
    n = math.hypot(ax, ay)
    ax, ay = ax / n, ay / n
    px, py = -ay, ax  # stroke direction, across the body
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
    span = max(max(xs) - min(xs), max(ys) - min(ys)) * 1.5
    rng = random.Random(7)
    t = -span
    k = 0
    while t < span:
        ox, oy = cx + ax * t, cy + ay * t
        # Slight, repeatable wobble so the strokes do not read as a ruled grid.
        # Engraved strokes start at the lit edge at varying depths and thin out, with a lean.
        a = int(alpha_lo + (alpha_hi - alpha_lo) * rng.random())
        lean = 0.25 + 0.15 * rng.random()
        lo, hi = -span * (0.4 + 0.6 * rng.random()), span * (0.5 + 0.5 * rng.random())
        d.line(
            [((ox + px * lo + ax * lean * lo) * SS, (oy + py * lo + ay * lean * lo) * SS),
             ((ox + px * hi + ax * lean * hi) * SS, (oy + py * hi + ay * lean * hi) * SS)],
            fill=a,
            width=SS,
        )
        t += spacing
        k += 1
    layer = ImageChops.multiply(layer, mask)
    for (x0, y0), (x1, y1) in edges:
        e = Image.new("L", layer.size, 0)
        ImageDraw.Draw(e).line([(x0 * SS, y0 * SS), (x1 * SS, y1 * SS)], fill=edge_alpha, width=int(1.4 * SS))
        layer = ImageChops.lighter(layer, e)
    return layer.resize((w, h), Image.LANCZOS)


def main():
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else src
    im = Image.open(src).convert("RGBA")
    a = im.getchannel("A")
    size = im.size

    # Tail strip: clear the lettering remnants first, then bridge.
    p0, p1 = (746.0, 121.0), (803.0, 75.0)
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    nx, ny = -uy, ux
    hw0, hw1 = 8.0, 6.5
    tail = [
        (p0[0] + nx * hw0, p0[1] + ny * hw0),
        (p1[0] + nx * hw1, p1[1] + ny * hw1),
        (p1[0] - nx * hw1, p1[1] - ny * hw1),
        (p0[0] - nx * hw0, p0[1] - ny * hw0),
    ]
    clear = Image.new("L", size, 0)
    ImageDraw.Draw(clear).polygon(
        [(p0[0] + nx * 22, p0[1] + ny * 22), (p1[0] + nx * 22, p1[1] + ny * 22), (p1[0] - nx * 22, p1[1] - ny * 22), (p0[0] - nx * 22, p0[1] - ny * 22)],
        fill=255,
    )
    # Only the lettering (soft, thin marks) goes; the two body pieces at the ends stay.
    keep = Image.new("L", size, 255)
    ImageDraw.Draw(keep).ellipse([p0[0] - 9, p0[1] - 9, p0[0] + 9, p0[1] + 9], fill=0)
    ImageDraw.Draw(keep).ellipse([p1[0] - 9, p1[1] - 9, p1[0] + 9, p1[1] + 9], fill=0)
    clear = ImageChops.multiply(clear, keep)
    a = ImageChops.multiply(a, ImageChops.invert(clear))
    edges = [
        ((tail[0][0], tail[0][1]), (tail[1][0], tail[1][1])),
        ((tail[3][0], tail[3][1]), (tail[2][0], tail[2][1])),
    ]
    a = ImageChops.lighter(a, strokes(size, tail, (ux, uy), 1.8, 70, 170, 160, edges))

    # Coil wedge: from the fold's edge to the descending body's top.
    wedge = [(509, 155), (530, 159), (551, 165), (563, 168), (556, 178), (541, 184), (521, 184), (509, 180)]
    a = ImageChops.lighter(a, strokes(size, wedge, (1.0, 0.25), 1.8, 60, 170, 150, [((509, 155), (551, 165)), ((509, 180), (521, 184))]))

    out_im = Image.new("RGBA", size, (0, 0, 0, 0))
    out_im.putalpha(a)
    out_im.save(out)


main()
