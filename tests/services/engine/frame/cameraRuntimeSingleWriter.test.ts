/**
 * cameraRuntimeSingleWriter — `state.cameraRuntime` has exactly one writer per
 * lifetime: `runFrame` installs `stepCameraRuntime`'s `next` once a frame,
 * `wireInput` seeds it once at boot. Any other writer restores the bug this
 * migration removed — a between-frames mutation the next frame's `prev`
 * silently inherits, invisible to every fixture. `engine.ts` is NOT allow-listed
 * because it seeds inside the state literal: a property initialiser, which the
 * predicate must not flag. An AST assertion, not a source-text grep, kept under
 * testing.md's "cross-file contract" rule (as `oneMpcSeam.test.ts` cites it);
 * the runtime half is `makeCameraSimHarness`'s per-frame `deepFreeze`.
 */
import { describe, it, expect } from 'vitest';
import { Project, SyntaxKind, Node } from 'ts-morph';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FIELD = 'cameraRuntime';

// `=` plus every compound form. A compound assignment into a numeric leaf
// (`state.cameraRuntime.outputs.simDays += 1`) is the same second writer as a
// plain one, and reads as an "adjustment" that a reviewer waves through.
const ASSIGNMENT_TOKENS: readonly SyntaxKind[] = [
  SyntaxKind.EqualsToken,
  SyntaxKind.PlusEqualsToken,
  SyntaxKind.MinusEqualsToken,
  SyntaxKind.AsteriskEqualsToken,
  SyntaxKind.AsteriskAsteriskEqualsToken,
  SyntaxKind.SlashEqualsToken,
  SyntaxKind.PercentEqualsToken,
  SyntaxKind.LessThanLessThanEqualsToken,
  SyntaxKind.GreaterThanGreaterThanEqualsToken,
  SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  SyntaxKind.AmpersandEqualsToken,
  SyntaxKind.BarEqualsToken,
  SyntaxKind.CaretEqualsToken,
  SyntaxKind.AmpersandAmpersandEqualsToken,
  SyntaxKind.BarBarEqualsToken,
  SyntaxKind.QuestionQuestionEqualsToken,
];

function walk(dir: string, extensions: readonly string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p, extensions);
    return extensions.some((ext) => p.endsWith(ext)) ? [p] : [];
  });
}

// DERIVED by sweeping the directories that hold every engine/state/UI path with
// a handle on EngineState — a new file dropped into any of them is gated with
// no hand-edit here.
const TS_FILES: readonly string[] = [
  ...walk('src/services', ['.ts', '.tsx']),
  ...walk('src/state', ['.ts', '.tsx']),
  ...walk('src/store', ['.ts', '.tsx']),
  ...walk('src/hooks', ['.ts', '.tsx']),
  ...walk('src/components', ['.ts', '.tsx']),
];

// A typo'd dir/extension sweeps zero files and the whole test passes vacuously
// — assert the sweep found real content, and specifically the writers and the
// near-miss neighbours this gate was written about.
const KNOWN_ANCHOR_FILES: readonly string[] = [
  'src/services/engine/frame/runFrame.ts',
  'src/services/engine/phases/wireInput.ts',
  'src/services/engine/engine.ts',
  'src/services/engine/camera/cameraDrivers.ts',
  'src/services/engine/camera/replayInput.ts',
  'src/services/engine/camera/stepCameraRuntime.ts',
];

const ALLOW_LIST: ReadonlyMap<string, string> = new Map([
  ['src/services/engine/frame/runFrame.ts', "the frame's one install of stepCameraRuntime's next"],
  ['src/services/engine/phases/wireInput.ts', 'the boot seed, once, when state.cam is built'],
]);

const project = new Project({ useInMemoryFileSystem: false });

/** True for `x.cameraRuntime` and any longer chain hanging off it. */
function rootedAtField(lhs: Node): boolean {
  let cursor: Node = lhs;
  while (Node.isPropertyAccessExpression(cursor) || Node.isElementAccessExpression(cursor)) {
    if (Node.isPropertyAccessExpression(cursor) && cursor.getName() === FIELD) return true;
    cursor = cursor.getExpression();
  }
  return false;
}

/** `file:line — source` for every assignment or Object.assign into the field. */
function writesToCameraRuntime(file: string): string[] {
  const sourceFile = project.addSourceFileAtPath(file);
  const assignments = sourceFile
    .getDescendantsOfKind(SyntaxKind.BinaryExpression)
    .filter((node) => ASSIGNMENT_TOKENS.includes(node.getOperatorToken().getKind()))
    .filter((node) => rootedAtField(node.getLeft()));
  // `Object.assign(state.cameraRuntime, …)` is a write with no assignment node.
  const objectAssigns = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((node) => node.getExpression().getText() === 'Object.assign')
    .filter((node) => {
      const target = node.getArguments()[0];
      return target !== undefined && rootedAtField(target);
    });
  return [...assignments, ...objectAssigns].map(
    (node) => `${file}:${node.getStartLineNumber()} — ${node.getText().split('\n')[0]}`,
  );
}

describe('state.cameraRuntime has exactly one writer per lifetime', () => {
  it('the directory sweep found real files, including each known anchor', () => {
    // Five swept dirs (~750 files); 400 leaves ample margin below the true
    // count while still catching an empty or typo'd walk.
    expect(TS_FILES.length).toBeGreaterThan(400);
    for (const anchor of KNOWN_ANCHOR_FILES) {
      expect(TS_FILES).toContain(anchor);
    }
  });

  it('no file outside the allow-list assigns into cameraRuntime', () => {
    // One assertion rather than a per-file `it.each`: the sweep is ~750 files,
    // and the failure message already names every offending file:line.
    const violations = TS_FILES.filter((f) => !ALLOW_LIST.has(f)).flatMap(writesToCameraRuntime);
    expect(violations).toEqual([]);
  });

  it.each([...ALLOW_LIST.entries()])('%s is a real writer (%s)', (file, _justification) => {
    // An entry that no longer writes is a stale rubber stamp: the file moved,
    // or the write did, and the gate silently stopped covering it.
    expect(writesToCameraRuntime(file).length).toBeGreaterThan(0);
  });

  it('engine.ts seeds the runtime by construction, not by assignment', () => {
    // The predicate must not flag an object-literal property initialiser —
    // otherwise the only way to build an EngineState would be to bypass it.
    expect(writesToCameraRuntime('src/services/engine/engine.ts')).toEqual([]);
  });
});
