import { describe, it, expect } from 'vitest';
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
