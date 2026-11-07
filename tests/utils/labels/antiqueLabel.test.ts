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

const KEEP: AntiqueLabelRule = { unlisted: 'keep', names: { 'sceneBody-sun': 'Sol', tiaki: null } };
const HIDE: AntiqueLabelRule = { unlisted: 'hide', names: { 'famous-m31': 'Andromedae' } };

describe('antiqueLabel', () => {
  it('renames a listed label and hides a null one', () => {
    expect(antiqueLabel(label('sceneBody-sun', 'Sun'), KEEP, false)?.text).toBe('Sol');
    expect(antiqueLabel(label('tiaki', 'Tiaki'), KEEP, false)).toBeNull();
  });

  it("follows the rule's unlisted policy", () => {
    expect(antiqueLabel(label('vega', 'Vega'), KEEP, false)?.text).toBe('Vega');
    expect(antiqueLabel(label('famous-m33', 'Triangulum Galaxy'), HIDE, false)).toBeNull();
  });

  it('hides a catalog number even where its category keeps', () => {
    expect(antiqueLabel(label('ross-154', 'Ross 154'), KEEP, false)).toBeNull();
    expect(antiqueLabel(label('ross-154', 'Ross 154'), undefined, false)).toBeNull();
  });

  it('keeps the focused subject, renamed when the table names it', () => {
    expect(antiqueLabel(label('ngc-1399', 'NGC 1399'), HIDE, true)?.text).toBe('NGC 1399');
    expect(antiqueLabel(label('famous-m31', 'Andromeda Galaxy'), HIDE, true)?.text).toBe(
      'Andromedae',
    );
  });

  it('drops the bracketed catalog number from a kept modern name', () => {
    expect(antiqueLabel(label('galaxy-cluster-virgo-m87', 'Virgo (M87)'), HIDE, true)?.text).toBe(
      'Virgo',
    );
  });

  it('sets the subject larger than any capped class label', () => {
    const big: Label2D = { ...label('sceneBody-sun', 'Sun'), minPixelSize: 40, maxPixelSize: 150 };
    const shown = antiqueLabel(big, KEEP, false)!;
    const subject = antiqueLabel(label('famous-m31', 'Andromeda Galaxy'), HIDE, true)!;
    expect(subject.minPixelSize).toBeGreaterThan(shown.maxPixelSize!);
  });

  it('puts a self-lifted name back on its subject', () => {
    const lifted: Label2D = {
      ...label('famous-m31', 'Andromeda Galaxy'),
      worldPos: [0, 9, 0],
      leader: { fromWorld: [1, 2, 3], toWorld: [0, 8, 0], pixelWidth: 1, color: [1, 1, 1, 1] },
    };
    const placed = antiqueLabel(lifted, HIDE, false)!;
    expect(placed.worldPos).toEqual([1, 2, 3]);
    expect(placed.leader).toBeUndefined();
  });

  it('does not read inherited keys as table entries', () => {
    expect(antiqueLabel(label('constructor', 'Constructor'), HIDE, false)).toBeNull();
  });
});
