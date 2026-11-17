/**
 * A website CSS module takes its colours from the tokens (`var(--site-text)`, `--color-*`, `--site-accent-*`
 * in styles/site.css and the app's tokens.css), so a palette change reaches every section. Hex, `rgb()`,
 * `hsl()` and named colours count; a `mask*` value is an alpha mask, not a colour, and is exempt by rule.
 * ALLOWED is today's debt per file: exact, and it only ever goes down.
 */
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssStatements } from '../../helpers/conventions/cssStatements';
import { walkFiles } from '../../helpers/conventions/walkFiles';

const SITE = 'packages/website/src';

const ALLOWED: Readonly<Record<string, number>> = {
  'components/docs/DocsSearch/DocsSearch.module.css': 1,
  'components/docs/FigureFrame/FigureFrame.module.css': 2,
  'components/pages/about/MakerPortrait/MakerPortrait.module.css': 5,
  'components/pages/classroom/EarthOrbit/EarthOrbit.module.css': 4,
  'components/pages/classroom/LinkAnatomy/LinkAnatomy.module.css': 1,
  'components/pages/features/DesktopSpread/DesktopSpread.module.css': 1,
  'components/pages/features/FeatureGallery/FeatureGallery.module.css': 4,
  'components/pages/features/FilmClock/FilmClock.module.css': 5,
  'components/pages/features/LinkSpread/LinkSpread.module.css': 1,
  'components/pages/home/Flight/Arrive.module.css': 3,
  'components/pages/home/Flight/Flight.module.css': 7,
  'components/pages/home/Flight/Intro.module.css': 3,
  'components/pages/home/Flight/Spine.module.css': 3,
  'components/pages/home/Flight/Stops.module.css': 7,
  'components/pages/home/Places/Places.module.css': 1,
  'components/pages/home/RealData/RealData.module.css': 3,
  'components/pages/home/Screens/Screens.module.css': 2,
  'components/pages/home/Sharing/Sharing.module.css': 3,
  'components/pages/science/FullFigure/FullFigure.module.css': 5,
  'components/shared/links/AddressStrip/AddressStrip.module.css': 2,
  'components/shared/links/OpenApp/OpenApp.module.css': 5,
  'components/shared/media/DeviceFrame/DeviceFrame.module.css': 4,
  'components/shared/media/Disc/Disc.module.css': 1,
  'components/shared/media/DiscFilm/DiscFilm.module.css': 1,
  'components/shared/media/FeatureFilm/FeatureFilm.module.css': 1,
  'components/shared/media/Phone3D/Phone3D.module.css': 7,
  'components/shared/media/PictureBand/PictureBand.module.css': 13,
  'components/shared/media/RemoteDemo/RemoteDemo.module.css': 4,
  'components/shared/text/Credits/Credits.module.css': 1,
  'components/site/Nav/Nav.module.css': 3,
  'dev/feedback/FeedbackBadge/FeedbackBadge.module.css': 1,
  'dev/feedback/FeedbackDock/FeedbackDock.module.css': 3,
  'dev/feedback/FeedbackOutline/FeedbackOutline.module.css': 5,
  'dev/feedback/FeedbackPanel/FeedbackPanel.module.css': 5,
  'dev/feedback/FeedbackPins/FeedbackPins.module.css': 2,
  'dev/review/ReviewBar/ReviewBar.module.css': 1,
  'dev/review/ReviewControl/ReviewControl.module.css': 3,
  'dev/review/ReviewPage/ReviewPage.module.css': 8,
  'dev/review/SectionIcons/SectionIcons.module.css': 3,
  'dev/review/SelectionChip/SelectionChip.module.css': 2,
  'styles/picture.module.css': 3,
};

const NAMED = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown
  burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan
  darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred
  darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink
  deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold
  goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush
  lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey
  lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow
  lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
  mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
  navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise
  palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue
  saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow
  springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(
    /\s+/,
  ),
);

function colourLiterals(value: string): string[] {
  const bare = value.replace(/(['"]).*?\1/g, '').replace(/url\([^)]*\)/g, '');
  return [
    ...[...bare.matchAll(/#[\da-f]{3,8}\b/gi)].map((m) => m[0]),
    ...[
      ...bare.matchAll(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\((?:[^()]|\([^()]*\))*\)/gi),
    ].map((m) => m[0]),
    ...[...bare.matchAll(/(?<![\w-])[a-z]+(?![\w-])/gi)]
      .map((m) => m[0])
      .filter((w) => NAMED.has(w.toLowerCase())),
  ];
}

const modules = walkFiles(SITE, ['.module.css']).map((m) => relative(SITE, m));

describe('website CSS modules take their colours from tokens', () => {
  expect(modules.length).toBeGreaterThan(0);

  it.each(modules)('%s', (rel) => {
    const found = cssStatements(readFileSync(`${SITE}/${rel}`, 'utf8')).flatMap((s) => {
      const decl = s.kind === 'declaration' && /^([\w-]+)\s*:([\s\S]*)$/.exec(s.text);
      return decl && !/^(-webkit-)?mask/.test(decl[1]!) ? colourLiterals(decl[2]!) : [];
    });
    const budget = ALLOWED[rel] ?? 0;
    expect(
      found.length,
      `${rel} writes ${found.length} colour literal(s) (${found.join(', ') || 'none'}); ALLOWED says ${budget}. ` +
        'Over: use a token, `var(--site-text-dim)`, `var(--color-fg)`, `var(--site-accent-…)` (styles/site.css), ' +
        'or a `color-mix(in srgb, var(--color-fg) 22%, transparent)` of one. Under: lower the row to ' +
        `${found.length} in the same commit (delete it at 0).`,
    ).toBe(budget);
  });

  it('ALLOWED names only modules that exist', () => {
    expect(Object.keys(ALLOWED).filter((rel) => !modules.includes(rel))).toEqual([]);
  });
});
