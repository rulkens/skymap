import { describe, it, expect } from 'vitest';
import { createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LayerSearchEntry } from '../../../src/@types/engine/layer/LayerSearchEntry';
import { ROW_VIEW } from '../../../src/components/CommandPalette/paletteRows';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { SCENE_STARS } from '../../../src/data/bodies/sceneStars';
import { Source } from '../../../src/data/sources';
import type { StructureSearchEntry } from '../../../src/@types/engine/StructureSearchEntry';
import type { ScoredRow } from '../../../src/@types/palette/ScoredRow';

const bodyEntry = (id: string): LayerSearchEntry => ({
  id: `body-${id}`,
  class: 'primary',
  names: [id],
});

describe('ROW_VIEW layer-row leading visual', () => {
  it('a body whose focus id has a captured card shot renders as an img', () => {
    const row: ScoredRow = { kind: 'layer', entry: bodyEntry(SCENE_EARTH.id), score: 0 };
    const leading = ROW_VIEW.layer(row).leading;
    expect(isValidElement(leading) && leading.type).toBe('img');
  });

  it('a body with no captured card shot falls back to the letter glyph', () => {
    // Phobos has no card in featuredTabs.ts (Mars' moons are not featured),
    // so it must never resolve to an img with a 404'ing src.
    const row: ScoredRow = { kind: 'layer', entry: bodyEntry('phobos'), score: 0 };
    const leading = ROW_VIEW.layer(row).leading;
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

describe('ROW_VIEW structure rows', () => {
  const entry: StructureSearchEntry = {
    id: 'galaxy-cluster-virgo-m87',
    name: 'Virgo Cluster',
    category: 'galaxy-cluster',
    abell: null,
    description: '',
    featured: true,
  };

  it('a featured structure renders its captured shot off its focus id', () => {
    const leading = ROW_VIEW.structure({ kind: 'structure', entry, score: 0 }).leading;
    expect(isValidElement(leading) && leading.type).toBe('img');
    expect(isValidElement(leading) && (leading.props as { src: string }).src).toBe(
      '/images/structures/galaxy-cluster-virgo-m87.webp',
    );
  });

  it('a bulk structure has no shot on disk, so it renders the letter glyph', () => {
    const bulk = { ...entry, id: 'galaxy-cluster-bulk-x1', featured: false };
    const leading = ROW_VIEW.structure({ kind: 'structure', entry: bulk, score: 0 }).leading;
    expect(isValidElement(leading) && leading.type).toBe('span');
  });
});

describe('ROW_VIEW layer rows', () => {
  const entry: LayerSearchEntry = { id: 'body-curiosity', names: ['Curiosity'], class: 'primary' };
  const secondaryOf = (e: LayerSearchEntry) =>
    renderToStaticMarkup(
      createElement('div', null, ROW_VIEW.layer({ kind: 'layer', entry: e, score: 0 }).secondary),
    );

  it('a layer row shows its entry chip, and none when omitted', () => {
    expect(secondaryOf({ ...entry, chip: 'Rover' })).toContain('Rover');
    expect(secondaryOf(entry)).toBe('<div></div>');
  });
});
