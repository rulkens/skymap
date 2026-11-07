import { describe, it, expect } from 'vitest';
import type { Label2D } from '../../../src/@types/rendering/Label2D';
import type { AntiqueLabelRule } from '../../../src/@types/rendering/AntiqueLabelRule';
import { antiqueLabel } from '../../../src/utils/labels/antiqueLabel';

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
  names: { 'sceneBody-sun': 'Sol', tiaki: null },
};
const PLACES: AntiqueLabelRule = {
  unlisted: 'hide',
  lettering: 'capitals',
  names: { 'famous-m31': 'Andromedae', saturn: 'Saturnus' },
};

describe('antiqueLabel', () => {
  it('renames a listed label and hides a null one', () => {
    expect(antiqueLabel(label('sceneBody-sun', 'Sun'), STARS, false)?.text).toBe('Sol');
    expect(antiqueLabel(label('tiaki', 'Tiaki'), STARS, false)).toBeNull();
  });

  it("follows the rule's unlisted policy", () => {
    expect(antiqueLabel(label('vega', 'Vega'), STARS, false)?.text).toBe('Vega');
    expect(antiqueLabel(label('famous-m33', 'Triangulum Galaxy'), PLACES, false)).toBeNull();
  });

  it('hides a catalog number even where its category keeps', () => {
    expect(antiqueLabel(label('ross-154', 'Ross 154'), STARS, false)).toBeNull();
    expect(antiqueLabel(label('ross-154', 'Ross 154'), undefined, false)).toBeNull();
  });

  it('cuts capitals letter-spaced with V for U, stars in italic as named', () => {
    const place = antiqueLabel(label('saturn', 'Saturn'), PLACES, false)!;
    expect(place.text).toBe('SATVRNVS');
    expect(place.trackingEm).toBeGreaterThan(0);
    const star = antiqueLabel(label('vega', 'Vega'), STARS, false)!;
    expect(star.font).not.toBe(place.font);
    expect(star.trackingEm).toBeUndefined();
  });

  it('keeps the focused subject, renamed when the table names it', () => {
    expect(antiqueLabel(label('ngc-1399', 'NGC 1399'), PLACES, true)?.text).toBe('NGC 1399');
    expect(antiqueLabel(label('famous-m31', 'Andromeda Galaxy'), PLACES, true)?.text).toBe(
      'ANDROMEDAE',
    );
  });

  it('Latinises a kept modern name', () => {
    const kept = (text: string) => antiqueLabel(label('x', text), PLACES, true)?.text;
    expect(kept('Virgo (M87)')).toBe('VIRGO');
    expect(kept('Laniakea\nSupercluster')).toBe('LANIAKEA');
    expect(kept('Galactic Centre')).toBe('CENTRVM GALAXIAE');
  });

  it('sets a kept catalog number in roman, which carries the digits', () => {
    const star = antiqueLabel(label('ross-154', 'Ross 154'), STARS, true)!;
    expect(star.font).toBe(antiqueLabel(label('saturn', 'Saturn'), PLACES, false)!.font);
  });

  it('sets the subject larger than any capped class label', () => {
    const big: Label2D = { ...label('saturn', 'Saturn'), minPixelSize: 40, maxPixelSize: 150 };
    const shown = antiqueLabel(big, PLACES, false)!;
    const subject = antiqueLabel(label('famous-m31', 'Andromeda Galaxy'), PLACES, true)!;
    expect(subject.minPixelSize).toBeGreaterThan(shown.maxPixelSize!);
  });

  it('puts a self-lifted name back on its subject', () => {
    const lifted: Label2D = {
      ...label('famous-m31', 'Andromeda Galaxy'),
      worldPos: [0, 9, 0],
      leader: { fromWorld: [1, 2, 3], toWorld: [0, 8, 0], pixelWidth: 1, color: [1, 1, 1, 1] },
    };
    const placed = antiqueLabel(lifted, PLACES, false)!;
    expect(placed.worldPos).toEqual([1, 2, 3]);
    expect(placed.leader).toBeUndefined();
  });

  it('does not read inherited keys as table entries', () => {
    expect(antiqueLabel(label('constructor', 'Constructor'), PLACES, false)).toBeNull();
  });
});
