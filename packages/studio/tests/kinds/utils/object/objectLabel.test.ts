import { describe, expect, it } from 'vitest';
import { objectLabel } from '../../../../src/kinds/utils/object/objectLabel';
import { actionForRow } from '../../../../../../src/utils/palette/actionForRow';
import { Source } from '../../../../../../src/data/source';
import type { ObjectIndex } from '../../../../src/@types/kinds/ObjectIndex';

const ALIAS = { pgc: 2557, names: ['Andromeda Galaxy', 'M31'], source: Source.Glade };
const INDEX: ObjectIndex = {
  famous: [],
  aliases: [ALIAS],
  structures: [],
  layerRows: [],
  refNames: {},
};

describe('objectLabel', () => {
  it('names a catalog galaxy by the focus id the palette gives its search row', () => {
    const action = actionForRow({ kind: 'alias', entry: ALIAS, score: 1 });
    const id = action.kind === 'focus' ? action.focusId : '';
    expect(objectLabel(id, INDEX)).toEqual({ name: 'Andromeda Galaxy', kind: 'Galaxy' });
  });

  it('knows nothing of an id the index does not hold', () => {
    expect(objectLabel('pgc-1', INDEX)).toBeNull();
  });
});
