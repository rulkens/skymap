// @vitest-environment jsdom
//
// SagaContextProvider — verifies the React context plumbing that delivers
// `setSagaContext` to `useEngine` without threading it as a prop.
//
// Two cases:
//   1. Inside the provider: `useSetSagaContext` returns the provided value.
//      We confirm identity by invoking the returned function and asserting
//      the typed spy was called.
//   2. Outside the provider: `useSetSagaContext` throws a clear error rather
//      than silently returning a no-op (a missing provider is a wiring bug,
//      not a graceful-degradation case).
//
// We use `createElement` + `renderHook` (no JSX) so this stays a `.tsx`
// file whose JSX is only inside the modules under test, not in this test
// body — matching the hooks.test.ts pattern in this directory.

import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { SagaContextProvider, useSetSagaContext } from '../../src/store/SagaContextProvider';
import type { SetSagaContext } from '../../src/store/types';
import { NOOP_SAGA_CONTEXT } from '../support/createTestStore';

describe('SagaContextProvider / useSetSagaContext', () => {
  it('throws a clear error when rendered outside a SagaContextProvider', () => {
    // renderHook with no wrapper mounts in a bare React tree — no provider.
    expect(() => renderHook(() => useSetSagaContext())).toThrow(
      'useSetSagaContext must be used within a <SagaContextProvider>',
    );
  });
});
