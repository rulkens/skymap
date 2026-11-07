"""lookbench: the antique look beside the plain render of the same view, for quick iteration.

  shoot <set> [--views a;b|name=hash] [--dpr 1] [--url URL] [--only antique|plain]
  sheet <set> · compare <before> <after> · crop <set> <view> x0,y0,x1,y1 [--other <set>]

Views live in views.json with pinned times, so Earth's face and Saturn's phase repeat. Output
goes to data/shots/lookbench/<set>/ (gitignored). The plain shot hides labels and UI: as near
to the look's input as a screenshot gets. Needs the dev server (`--url`); see README.md.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = ROOT / 'data' / 'shots' / 'lookbench'
GAP = 12


def views(selected):
    table = json.loads((HERE / 'views.json').read_text())
    if not selected:
        return table
    picked = {}
    # ';' between views: a pose link carries commas of its own.
    for item in selected.split(';'):
        name, _, link = item.partition('=')
        if link:
            picked[name] = link
        elif name in table:
            picked[name] = table[name]
        else:
            sys.exit(f'lookbench: unknown view {name!r} (views.json has {", ".join(table)})')
    return picked


def shoot(args):
    folder = OUT / args.set
    folder.mkdir(parents=True, exist_ok=True)
    kinds = [args.only] if args.only else ['plain', 'antique']
    for name, link in views(args.views).items():
        for kind in kinds:
            query = '?antique' if kind == 'antique' else ''
            out = folder / f'{name}-{kind}.png'
            cmd = ['npm', 'run', '-s', 'shot', '--', f'{query}#{link}', '--url', args.url,
                   '--size', args.size, '--dpr', str(args.dpr), '--timeout', '45',
                   '--hide-ui', '--out', str(out)]
            if kind == 'plain':
                cmd.append('--hide-labels')
            result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
            print(out if result.returncode == 0 else f'FAILED {name} {kind}: {result.stderr[-400:]}')


def side_by_side(images, labels, out):
    h = max(i.height for i in images)
    w = sum(i.width for i in images) + GAP * (len(images) - 1)
    sheet = Image.new('RGB', (w, h + 28), (245, 245, 240))
    x = 0
    draw = ImageDraw.Draw(sheet)
    for image, label in zip(images, labels):
        sheet.paste(image, (x, 28))
        draw.text((x + 6, 8), label, fill=(30, 30, 30))
        x += image.width + GAP
    sheet.save(out)
    print(out)


def load(folder, name, kind, width=None):
    path = OUT / folder / f'{name}-{kind}.png'
    if not path.exists():
        return None
    image = Image.open(path).convert('RGB')
    if width and image.width > width:
        image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    return image


def sheet(args):
    for name in views(args.views):
        pair = [load(args.set, name, 'plain', 1200), load(args.set, name, 'antique', 1200)]
        if None in pair:
            continue
        side_by_side(pair, [f'{name} plain', f'{name} antique ({args.set})'],
                     OUT / args.set / f'{name}-sheet.png')


def compare(args):
    folder = OUT / args.after
    for name in views(args.views):
        pair = [load(args.before, name, 'antique', 1200), load(args.after, name, 'antique', 1200)]
        if None in pair:
            continue
        side_by_side(pair, [f'{name} {args.before}', f'{name} {args.after}'],
                     folder / f'{name}-vs-{args.before}.png')


def crop(args):
    box = tuple(int(v) for v in args.box.split(','))
    images, labels = [], []
    for folder in [args.set] + ([args.other] if args.other else []):
        for kind in ['plain', 'antique']:
            if kind == 'plain' and folder != args.set:
                continue
            image = load(folder, args.view, kind)
            if image is not None:
                images.append(image.crop(box))
                labels.append(f'{args.view} {kind} ({folder})')
    side_by_side(images, labels, OUT / args.set / f'{args.view}-crop.png')


def main():
    parser = argparse.ArgumentParser(description='Antique look bench')
    sub = parser.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('shoot')
    p.add_argument('set')
    p.add_argument('--views', default='')
    p.add_argument('--dpr', type=float, default=1)
    p.add_argument('--size', default='1600x900')
    p.add_argument('--url', default='http://localhost:5173')
    p.add_argument('--only', choices=['plain', 'antique'])
    p.set_defaults(fn=shoot)
    p = sub.add_parser('sheet')
    p.add_argument('set')
    p.add_argument('--views', default='')
    p.set_defaults(fn=sheet)
    p = sub.add_parser('compare')
    p.add_argument('before')
    p.add_argument('after')
    p.add_argument('--views', default='')
    p.set_defaults(fn=compare)
    p = sub.add_parser('crop')
    p.add_argument('set')
    p.add_argument('view')
    p.add_argument('box')
    p.add_argument('--other')
    p.set_defaults(fn=crop)
    args = parser.parse_args()
    args.fn(args)


if __name__ == '__main__':
    main()
