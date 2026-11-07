import { describe, it, expect } from 'vitest';
import type { Label2D } from '../../../src/@types/rendering/Label2D';
import type { AntiqueLabelRule } from '../../../src/@types/rendering/AntiqueLabelRule';
import { antiqueLabel } from '../../../src/utils/labels/antiqueLabel';
import { bodyCaption } from '../../../src/utils/labels/bodyCaption';
import { ANTIQUE_LABEL_RULES } from '../../../src/data/labels/antiqueLabelRules';
import { ANTIQUE_LABEL_STYLE } from '../../../src/data/labels/antiqueLabelStyle';
import { SCENE_STARS } from '../../../src/data/bodies/sceneStars';
import { ANTIQUE_EARTH_PLACES } from '../../../src/data/labels/antiqueEarthPlaces';

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
      expect(shown!.text).toBe(rule?.names[caption.id] ?? star.label);
      expect(shown!.font).toBe(ANTIQUE_LABEL_STYLE.italicFont);
    }
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

  it('puts a self-lifted name back on its subject', () => {
    const lifted: Label2D = {
      ...label('famous-m31', 'Andromeda Galaxy'),
      worldPos: [0, 9, 0],
      leader: { fromWorld: [1, 2, 3], toWorld: [0, 8, 0], pixelWidth: 1, color: [1, 1, 1, 1] },
    };
    const placed = antiqueLabel(lifted, PLACES, false, ALL_FONTS)!;
    expect(placed.worldPos).toEqual([1, 2, 3]);
    expect(placed.leader).toBeUndefined();
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

  it('does not read inherited keys as table entries', () => {
    expect(antiqueLabel(label('constructor', 'Constructor'), PLACES, false, ALL_FONTS)).toBeNull();
  });
});
