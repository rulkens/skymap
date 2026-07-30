import { describe, it, expect } from 'vitest';
import { renderRefReport } from '../../../../tools/utils/refactor/renderRefReport';
import type { RefReport } from '../../../../tools/utils/refactor/collectRefs';

// A hand-built report keeps this test about the SERIALIZER's shape, decoupled
// from ts-morph's reference walk (that is collectRefs.test.ts's job).
const REPORT: RefReport = {
  target: 'src/data/superGalacticTransform.ts#SG_TO_EQ_MATRIX',
  refs: [
    { filePath: 'src/a.ts', line: 88, column: 10, kind: 'import', enclosing: '<module>' },
    { filePath: 'src/b.ts', line: 12, column: 3, kind: 'call', enclosing: 'function frameTick' },
    { filePath: 'tests/a.test.ts', line: 4, column: 1, kind: 'test', enclosing: '<module>' },
  ],
  fileCount: 3,
  testCount: 1,
};

describe('renderRefReport', () => {
  it('--json output parses to the documented shape', () => {
    const parsed = JSON.parse(renderRefReport(REPORT, true));

    expect(parsed.target).toBe(REPORT.target);
    expect(parsed.summary.refs).toBe(REPORT.refs.length);
    expect(parsed.summary.files).toBe(REPORT.fileCount);
    expect(parsed.summary.tests).toBe(REPORT.testCount);
    expect(parsed.refs).toHaveLength(REPORT.refs.length);
    // Each ref carries the documented per-entry fields.
    expect(parsed.refs[0]).toMatchObject({
      filePath: 'src/a.ts',
      line: 88,
      column: 10,
      kind: 'import',
      enclosing: '<module>',
    });
  });

  it('non-json output is a string mentioning the target', () => {
    const text = renderRefReport(REPORT, false);
    expect(typeof text).toBe('string');
    expect(text).toContain(REPORT.target);
  });
});
