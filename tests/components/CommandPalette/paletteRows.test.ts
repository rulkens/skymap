import { describe, it, expect } from 'vitest';
import { isValidElement } from 'react';
import { ROW_VIEW } from '../../../src/components/CommandPalette/paletteRows';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { SCENE_STARS } from '../../../src/data/bodies/sceneStars';
import { Source } from '../../../src/data/sources';
import { SCENE_BODIES } from '../../../src/data/bodies/sceneBodies';
import { findByIdOrThrow } from '../../../src/utils/object/findByIdOrThrow';
import type { ScoredRow } from '../../../src/components/CommandPalette/paletteRowModel';

describe('ROW_VIEW body leading visual', () => {
  it('a body whose focus id has a captured card shot renders as an img', () => {
    const row: ScoredRow = { kind: 'body', body: SCENE_EARTH, score: 0 };
    const leading = ROW_VIEW.body(row).leading;
    expect(isValidElement(leading) && leading.type).toBe('img');
  });

  it('a body with no captured card shot falls back to the letter glyph', () => {
    // Phobos has no card in featuredTabs.ts (Mars' moons are not featured),
    // so it must never resolve to an img with a 404'ing src.
    const phobos = findByIdOrThrow(SCENE_BODIES, 'phobos', 'paletteRows.test');
    const row: ScoredRow = { kind: 'body', body: phobos, score: 0 };
    const leading = ROW_VIEW.body(row).leading;
    expect(isValidElement(leading) && leading.type).toBe('span');
  });
});

describe('ROW_VIEW star rows', () => {
  it("renders a featured star's captured shot off its focus id", () => {
    // A star row's focus id is what the card is filed under, so the shot comes
    // straight from `cardShotUrl` — the same path bodies take. A row that fell
    // back to the body focus id would render a 404'ing img.
    const index = SCENE_STARS.findIndex((star) => star.id === 'sirius');
    const row: ScoredRow = {
      kind: 'starCatalog',
      source: Source.FamousStar,
      index,
      star: SCENE_STARS[index]!,
      score: 0,
    };
    const leading = ROW_VIEW.starCatalog(row).leading;
    expect(isValidElement(leading) && leading.type).toBe('img');
    expect(isValidElement(leading) && (leading.props as { src: string }).src).toBe(
      '/images/featured/star-sirius.webp',
    );
  });
});
