import { describe, expect, it } from 'vitest';

import type { AntiqueTitleGroup } from '../../../../src/@types/rendering/AntiqueTitleGroup';
import { fitAntiqueTitle } from '../../../../src/utils/gpu/antiqueLook/fitAntiqueTitle';

// A monospaced face: 0.6 em per character, ink 1 em tall, caps 0.7 em.
const measure = ({ text }: { text: string }) => ({ width: 0.6 * text.length, height: 1, cap: 0.7 });
const style = { face: 'roman', cap: 1, tracking: 0, minSqueeze: 0.9 } as const;

describe('fitAntiqueTitle', () => {
  it('breaks a long line when that lets the block grow, and keeps every line inside the oval', () => {
    const groups: AntiqueTitleGroup[] = [
      { style, breaks: [['NOVA']] },
      { style, breaks: [['TOTIVS TERRARVM ORBIS TABVLA'], ['TOTIVS TERRARVM', 'ORBIS TABVLA']] },
    ];
    const rx = 100;
    const ry = 100;
    const lines = fitAntiqueTitle(groups, measure, rx, ry);
    expect(lines.map((l) => l.line.text)).toEqual(['NOVA', 'TOTIVS TERRARVM', 'ORBIS TABVLA']);
    for (const { line, em, squeeze, top } of lines) {
      const halfWidth = (0.6 * line.text.length * em * squeeze) / 2;
      const far = Math.max(Math.abs(top), Math.abs(top + em)) / ry;
      expect(halfWidth).toBeLessThanOrEqual(rx * Math.sqrt(1 - far * far) + 1e-6);
      expect(squeeze).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('sizes groups by their cap ratio', () => {
    const lines = fitAntiqueTitle(
      [
        { style, breaks: [['AB']] },
        { style: { ...style, cap: 0.5 }, breaks: [['CD']] },
      ],
      measure,
      100,
      100,
    );
    expect(lines[1]!.em / lines[0]!.em).toBeCloseTo(0.5);
  });
});
