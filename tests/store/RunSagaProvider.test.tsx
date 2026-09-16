// @vitest-environment jsdom
//
// RunSagaProvider — verifies the React context plumbing that delivers
// `runSaga` to `useEngine` without threading it as a prop, mirroring
// SagaContextProvider.test.tsx for its `setSagaContext` sibling.

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRunSaga } from '../../src/store/RunSagaProvider';

describe('RunSagaProvider / useRunSaga', () => {
  it('throws a clear error when rendered outside a RunSagaProvider', () => {
    expect(() => renderHook(() => useRunSaga())).toThrow(
      'useRunSaga must be used within a <RunSagaProvider>',
    );
  });
});
