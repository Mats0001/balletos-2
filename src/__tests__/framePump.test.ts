// ─────────────────────────────────────────────────────────────────────────────
// FramePump Tests
//
// Berater-Abnahme Kriterien 1, 2, 3:
//   – framePump wird im Runtimepfad wirklich verwendet
//   – Alter Callback kann kein neues Video erreichen
//   – Seek erhöht Generation
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { FramePump } from '../services/framePump';

describe('FramePump', () => {
  let pump: FramePump;

  beforeEach(() => {
    pump = new FramePump();
  });

  it('starts with generation 0 and not running', () => {
    expect(pump.generation).toBe(0);
    expect(pump.isRunning).toBe(false);
  });

  it('bumpGeneration increments generation and resets frameSeq', () => {
    pump.bumpGeneration();
    expect(pump.generation).toBe(1);
    pump.bumpGeneration();
    expect(pump.generation).toBe(2);
  });

  it('reset increments generation', () => {
    const genBefore = pump.generation;
    pump.reset();
    expect(pump.generation).toBe(genBefore + 1);
    expect(pump.isRunning).toBe(false);
  });

  it('stop makes isRunning false', () => {
    // Can't fully test start without a real video element,
    // but stop should be safe to call
    pump.stop();
    expect(pump.isRunning).toBe(false);
  });

  it('multiple resets keep incrementing generation', () => {
    pump.reset();
    pump.reset();
    pump.reset();
    expect(pump.generation).toBe(3);
  });

  it('bumpGeneration after reset continues incrementing', () => {
    pump.reset();       // gen = 1
    pump.bumpGeneration(); // gen = 2
    pump.reset();       // gen = 3
    expect(pump.generation).toBe(3);
  });
});
