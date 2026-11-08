import { describe, it, expect } from 'vitest';
import type { Label2D } from '../../../src/@types/rendering/Label2D';
import type { AntiqueLabelRule } from '../../../src/@types/rendering/AntiqueLabelRule';
import { bayerGreek } from '../../../src/utils/labels/bayerGreek';
import { FONTS } from '../../../src/data/fonts';
import { antiqueLabel } from '../../../src/utils/labels/antiqueLabel';
import { bodyCaption } from '../../../src/utils/labels/bodyCaption';
import { ANTIQUE_LABEL_RULES } from '../../../src/data/labels/antiqueLabelRules';
import { ANTIQUE_LABEL_STYLE } from '../../../src/data/labels/antiqueLabelStyle';
import { SCENE_STARS } from '../../../src/data/bodies/sceneStars';
import { ANTIQUE_EARTH_TOWNS } from '../../../src/data/labels/antiqueEarthTowns';
import { ANTIQUE_PLACE_LETTERING } from '../../../src/data/labels/antiquePlaceLettering';
import { ANTIQUE_EARTH_PLACES } from '../../../src/data/labels/antiqueEarthPlaces';
import { CAPTION_PRIORITY_SCALE } from '../../../src/data/labels/captionPriorityScale';

const label = (id: string, text: string): Label2D => ({
  id,
  text,
  worldPos: [0, 0, 0],
  font: 'cormorant',
  pixelSize: 0,
});

const STARS: AntiqueLabelRule = {
  unlisted: 'keep',
  lettering: 'italic',
  names: { 'sceneBody-sun': 'Sol' },
};
const CONSTELLATIONS: AntiqueLabelRule = {
  unlisted: 'keep',
  lettering: 'capitals',
  names: { Carina: 'Argo Navis', Antlia: null },
};
const PLACES: AntiqueLabelRule = {
  unlisted: 'hide',
  lettering: 'capitals',
  names: { 'famous-m31': 'Andromedae', saturn: 'Saturnus' },
};

const ALL_FONTS = () => true;

describe('antiqueLabel', () => {
  it('renames a listed label and hides a null one', () => {
    expect(antiqueLabel(label('sceneBody-sun', 'Sun'), STARS, false, ALL_FONTS)?.text).toBe('Sol');
    expect(antiqueLabel(label('Carina', 'Carina'), CONSTELLATIONS, false, ALL_FONTS)?.text).toBe(
      'ARGO NAVIS',
    );
    expect(antiqueLabel(label('Antlia', 'Antlia'), CONSTELLATIONS, false, ALL_FONTS)).toBeNull();
  });

  it('shows every named star: the period name where the table has one, else the modern name in the star italic', () => {
    const rule = ANTIQUE_LABEL_RULES.starCatalog;
    for (const star of SCENE_STARS) {
      // A catalog number is no name; it hides (below) unless it is the subject.
      if (/\d/.test(star.label)) continue;
      const caption = bodyCaption(star, 1, [0, 0, 0], [1, 1, 1], 0, undefined);
      const shown = antiqueLabel(caption, rule, false, ALL_FONTS);
      expect(shown, star.label).not.toBeNull();
      expect(shown!.text).toBe(bayerGreek(rule?.names[caption.id] ?? star.label));
      expect(shown!.font).toBe(ANTIQUE_LABEL_STYLE.italicFont);
      // A glyph the baked italic atlas lacks would print as a hole in the name.
      const atlas = FONTS[ANTIQUE_LABEL_STYLE.italicFont].charset;
      for (const ch of shown!.text.replace('\n', '')) expect(atlas, shown!.text).toContain(ch);
    }
  });

  it('prints a Bayer letter as its Greek glyph, in the italic only', () => {
    const rule = ANTIQUE_LABEL_RULES.starCatalog;
    const ceti = antiqueLabel(label('sceneBody-tau-ceti', 'Tau Ceti'), rule, false, ALL_FONTS);
    expect(ceti!.text).toBe('τ Ceti');
    const avior = antiqueLabel(label('sceneBody-avior', 'Avior'), rule, false, ALL_FONTS);
    expect(avior!.text).toBe('ε Argus\n(Avior)');
  });

  it("follows the rule's unlisted policy", () => {
    expect(antiqueLabel(label('vega', 'Vega'), STARS, false, ALL_FONTS)?.text).toBe('Vega');
    expect(
      antiqueLabel(label('famous-m33', 'Triangulum Galaxy'), PLACES, false, ALL_FONTS),
    ).toBeNull();
  });

  it('hides a catalog number even where its category keeps', () => {
    expect(antiqueLabel(label('ross-154', 'Ross 154'), STARS, false, ALL_FONTS)).toBeNull();
    expect(antiqueLabel(label('ross-154', 'Ross 154'), undefined, false, ALL_FONTS)).toBeNull();
  });

  it('cuts capitals letter-spaced with V for U, stars in italic as named', () => {
    const place = antiqueLabel(label('saturn', 'Saturn'), PLACES, false, ALL_FONTS)!;
    expect(place.text).toBe('SATVRNVS');
    expect(place.trackingEm).toBeGreaterThan(0);
    const star = antiqueLabel(label('vega', 'Vega'), STARS, false, ALL_FONTS)!;
    expect(star.font).not.toBe(place.font);
    expect(star.trackingEm ?? 0).toBe(0);
  });

  it("sets a producer's mixed tiers from letteringOf", () => {
    const bodies: AntiqueLabelRule = {
      unlisted: 'keep',
      lettering: 'roman',
      letteringOf: { saturn: 'capitals' },
      names: {},
    };
    const moon = antiqueLabel(label('rhea', 'Rhea'), bodies, false, ALL_FONTS)!;
    const planet = antiqueLabel(label('saturn', 'Saturn'), bodies, false, ALL_FONTS)!;
    expect(moon.text).toBe('Rhea');
    expect(planet.text).toBe('SATVRN');
    expect(moon.maxPixelSize!).toBeLessThan(planet.minPixelSize!);
  });

  it('sets a long subject title in italic rather than capitals', () => {
    const subject = antiqueLabel(label('famous-m31', 'x'), PLACES, true, ALL_FONTS)!;
    const long = antiqueLabel(
      { ...label('m31', 'Nebula in Cingulo Andromedae') },
      PLACES,
      true,
      ALL_FONTS,
    )!;
    expect(long.text).toBe('Nebula in Cingulo Andromedae');
    expect(long.font).not.toBe(subject.font);
    expect(long.minPixelSize).toBe(subject.minPixelSize);
  });

  it('keeps the focused subject, renamed when the table names it', () => {
    expect(antiqueLabel(label('ngc-1399', 'NGC 1399'), PLACES, true, ALL_FONTS)?.text).toBe(
      'NGC 1399',
    );
    expect(
      antiqueLabel(label('famous-m31', 'Andromeda Galaxy'), PLACES, true, ALL_FONTS)?.text,
    ).toBe('ANDROMEDAE');
  });

  it('Latinises a kept modern name', () => {
    const kept = (text: string) => antiqueLabel(label('x', text), PLACES, true, ALL_FONTS)?.text;
    expect(kept('Virgo (M87)')).toBe('VIRGO');
    expect(kept('Laniakea\nSupercluster')).toBe('LANIAKEA');
    expect(kept('Galactic Centre')).toBe('Centrum Galaxiae');
  });

  it('titles M51 by its catalogue number in capitals, its modern name glossed beneath as written', () => {
    // Owner ruling 2026-11-08: the gloss line does not count toward the capitals' length.
    expect(
      antiqueLabel(label('famous-m51', 'Whirlpool Galaxy'), PLACES, true, ALL_FONTS)?.text,
    ).toBe('MESSIER 51\n(Whirlpool Galaxy)');
  });

  it("ranks the subject's title over every other name", () => {
    const title = antiqueLabel(label('x', 'Ross 154'), STARS, true, ALL_FONTS)!;
    expect(title.declutterPriority).toBe(Number.MAX_VALUE);
  });

  it("names a constellation over its stars, each keeping its producer's tie-break", () => {
    const S = CAPTION_PRIORITY_SCALE;
    const cetus = { ...label('Cetus', 'Cetus'), declutterPriority: 5 * S };
    const mira = { ...label('sceneBody-mira', 'Mira'), declutterPriority: 10 * S + 2 };
    const sirius = { ...label('sceneBody-sirius', 'Sirius'), declutterPriority: 10 * S + 1 };
    const rules = ANTIQUE_LABEL_RULES;
    const rank = (l: Label2D, rule: AntiqueLabelRule | undefined) =>
      antiqueLabel(l, rule, false, ALL_FONTS)!.declutterPriority!;
    expect(rank(cetus, rules.constellations)).toBeGreaterThan(rank(mira, rules.starCatalog));
    expect(rank(mira, rules.starCatalog)).toBeGreaterThan(rank(sirius, rules.starCatalog));
  });

  it('sets a kept catalog number in roman, which carries the digits', () => {
    const star = antiqueLabel(label('ross-154', 'Ross 154'), STARS, true, ALL_FONTS)!;
    expect(star.font).toBe(antiqueLabel(label('saturn', 'Saturn'), PLACES, false, ALL_FONTS)!.font);
  });

  it('sets the subject larger than any capped class label', () => {
    const big: Label2D = { ...label('saturn', 'Saturn'), minPixelSize: 40, maxPixelSize: 150 };
    const shown = antiqueLabel(big, PLACES, false, ALL_FONTS)!;
    const subject = antiqueLabel(label('famous-m31', 'Andromeda Galaxy'), PLACES, true, ALL_FONTS)!;
    expect(subject.minPixelSize).toBeGreaterThan(shown.maxPixelSize!);
  });

  it("keeps the label's own font until the look's fonts land", () => {
    const shown = antiqueLabel(label('saturn', 'Saturn'), PLACES, false, () => false)!;
    expect(shown.font).toBe('cormorant');
    expect(shown.text).toBe('SATVRNVS');
  });

  it('sets every globe name over its place, centred, lands in capitals and seas in italic, whatever the body rule hides', () => {
    const rule = ANTIQUE_LABEL_RULES.body;
    expect(rule?.unlisted).toBe('hide');
    for (const place of ANTIQUE_EARTH_PLACES) {
      const shown = antiqueLabel(label(place.id, place.name), rule, false, ALL_FONTS);
      expect(shown, place.id).not.toBeNull();
      expect(shown!.alignX).toBe('center');
      expect(shown!.font).toBe(
        place.kind === 'sea' ? ANTIQUE_LABEL_STYLE.italicFont : ANTIQUE_LABEL_STYLE.romanFont,
      );
    }
    const europa = antiqueLabel(label('earthPlace-europa', 'Europa'), rule, false, ALL_FONTS)!;
    expect(europa.text).toBe('EVROPA');
  });

  it("sets a town beside its sign in its tier's cut and size, whatever the body rule hides", () => {
    const rule = ANTIQUE_LABEL_RULES.body;
    const city = antiqueLabel(label('earthTown-amsteldam', 'Amsteldam'), rule, false, ALL_FONTS)!;
    expect(city.alignX).toBe('left');
    expect(city.font).toBe(ANTIQUE_LABEL_STYLE.romanFont);
    expect(city.minPixelSize).toBe(ANTIQUE_PLACE_LETTERING['earthTown-amsteldam']!.px);
    const village = ANTIQUE_EARTH_TOWNS.find((town) => town.tier === 3)!;
    const shown = antiqueLabel(label(village.id, village.name), rule, false, ALL_FONTS)!;
    expect(shown.font).toBe(ANTIQUE_LABEL_STYLE.italicFont);
  });

  it("sets an arm of the Galaxy in letter-spaced italic capitals, V for U, under the Milky Way's rule", () => {
    const rule = ANTIQUE_LABEL_RULES.milkyWay;
    const arm = antiqueLabel(
      label('mwName-sagittarius', 'Brachium Sagittarii'),
      rule,
      false,
      ALL_FONTS,
    )!;
    expect(arm.text).toBe('BRACHIVM SAGITTARII');
    expect(arm.font).toBe(ANTIQUE_LABEL_STYLE.italicFont);
    expect(arm.trackingEm).toBe(ANTIQUE_LABEL_STYLE.spacedItalic.trackingEm);
    expect(arm.alignX).toBe('center');
  });

  it("keeps a placed Moon name's side and size from its producer: a crater flipped left stays right-aligned", () => {
    const rule = ANTIQUE_LABEL_RULES.body;
    const flipped: Label2D = {
      ...label('moonPlace-copernicus', 'Copernicus'),
      alignX: 'right',
      minPixelSize: 14,
      maxPixelSize: 14,
    };
    const crater = antiqueLabel(flipped, rule, false, ALL_FONTS)!;
    expect(crater.alignX).toBe('right');
    expect(crater.maxPixelSize).toBe(14);
    expect(crater.font).toBe(ANTIQUE_LABEL_STYLE.italicFont);
    const mare = antiqueLabel(
      { ...label('moonPlace-mareImbrium', 'Mare\nImbrium'), alignX: 'left' },
      rule,
      false,
      ALL_FONTS,
    )!;
    expect(mare.alignX).toBe('center');
    expect(mare.text).toBe('MARE\nIMBRIVM');
  });

  it('does not read inherited keys as table entries', () => {
    expect(antiqueLabel(label('constructor', 'Constructor'), PLACES, false, ALL_FONTS)).toBeNull();
  });
});
