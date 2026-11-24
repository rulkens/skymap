import { describe, it, expect, vi } from 'vitest';
import { BODY_BODY_ROWS } from '../../../../src/layers/body/bodies/bodyBodyRows';
import { EPHEMERIS_CORRECTIONS } from '../../../../src/layers/body/bodies/ephemerisCorrections.generated';

describe('BODY_BODY_ROWS', () => {
  // The join drops a correction silently when its id matches no orbit row: a renamed or
  // re-kinded row would fall back to pure Kepler, hundreds of km off, with nothing failing.
  it('every corrected id carries its correction on its row', () => {
    for (const [id, correction] of Object.entries(EPHEMERIS_CORRECTIONS)) {
      const row = BODY_BODY_ROWS.find((r) => r.body.id === id);
      expect(row?.position.kind, id).toBe('orbit');
      expect(row?.position.kind === 'orbit' && row.position.correction, id).toBe(correction);
    }
  });
});

describe('BODY_BODY_ROWS shape-model ids', () => {
  // An id matching no row would leave that body drawn as a sphere with nothing failing.
  it('throws at load when a shape-model id matches no authored row', async () => {
    vi.resetModules();
    vi.doMock('../../../../src/layers/body/bodies/shapeModelBodyIds', () => ({
      SHAPE_MODEL_BODY_IDS: ['no-such-body'],
    }));
    await expect(import('../../../../src/layers/body/bodies/bodyBodyRows')).rejects.toThrow(
      "'no-such-body'",
    );
    vi.doUnmock('../../../../src/layers/body/bodies/shapeModelBodyIds');
  });
});
