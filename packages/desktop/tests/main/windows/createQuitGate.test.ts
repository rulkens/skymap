import { describe, expect, it } from 'vitest';
import { createQuitGate } from '../../../src/main/windows/createQuitGate';

describe('createQuitGate', () => {
  it('refuses every close until the control window allows the quit', () => {
    const gate = createQuitGate();
    expect(gate.mayClose()).toBe(false);
    gate.allowQuit();
    expect(gate.mayClose()).toBe(true);
  });
});
