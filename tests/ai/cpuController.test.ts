import { describe, it, expect } from 'vitest';
import { Player, type FrameInput } from '../../src/engine/player';
import { CpuController, CPU_LEVELS, syncThinker } from '../../src/ai/cpuController';

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) >>> 0) / 0x100000000);
}

function play(level: number, seed: number, pieces: number) {
  const p = new Player({ seed });
  const enemy = new Player({ seed: seed + 1 });
  const cpu = new CpuController(level, syncThinker, rng(seed));
  let maxChain = 0;
  const inputs: FrameInput[] = [];
  for (let i = 0; i < 60 * 60 * 20 && p.phase !== 'dead' && p.tsumoIndex < pieces; i++) {
    const input = cpu.input(p, enemy);
    inputs.push(input);
    p.step(input);
    for (const e of p.events) if (e.t === 'chainEnd') maxChain = Math.max(maxChain, e.chain);
  }
  return { p, maxChain, inputs };
}

describe('CpuController', () => {
  it('強さは5段階', () => {
    expect(CPU_LEVELS).toHaveLength(5);
  });
  it('レベル3はおじゃまなしで100手置いても負けない', { timeout: 60_000 }, () => {
    for (const seed of [1, 2]) {
      const { p } = play(3, seed, 100);
      expect(p.phase).not.toBe('dead');
      expect(p.tsumoIndex).toBeGreaterThanOrEqual(100);
    }
  });
  it('レベル5は120手のうちに5連鎖以上を撃つ', { timeout: 60_000 }, () => {
    const { maxChain } = play(5, 1, 120);
    expect(maxChain).toBeGreaterThanOrEqual(5);
  });
  it('入力は1フレームに回転1回まで、左右同時押しなし', { timeout: 60_000 }, () => {
    const { inputs } = play(4, 3, 40);
    for (const i of inputs) {
      expect(i.rotL && i.rotR).toBe(false);
      expect(i.left && i.right).toBe(false);
    }
  });
});
