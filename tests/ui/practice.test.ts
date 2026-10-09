import { it, expect } from 'vitest';
import { PracticeHistory } from '../../src/ui/practiceHistory';
import { Player } from '../../src/engine/player';

it('最大200手まで覚えて、古いものから捨てる', () => {
  const h = new PracticeHistory<number>();
  for (let i = 0; i < 205; i++) h.push(i);
  expect(h.size).toBe(200);
  expect(h.peek()).toBe(204);
});

it('undo は1つ前のツモが出た時点に戻す。最初の1手より前には戻らない', () => {
  const h = new PracticeHistory<number>();
  expect(h.undo(false)).toBeUndefined();
  h.push(1);
  expect(h.undo(false)).toBeUndefined();
  h.push(2);
  h.push(3);
  expect(h.undo(false)).toBe(2);
  expect(h.undo(false)).toBe(1);
  expect(h.undo(false)).toBeUndefined();
});

it('負けたあとの undo は、負けた手をやり直す（最後のツモが出た時点へ）', () => {
  const h = new PracticeHistory<number>();
  h.push(1);
  h.push(2);
  expect(h.undo(true)).toBe(2);
  expect(h.size).toBe(2);
});

it('Player と組み合わせて、1手戻すと盤面とツモ番号が戻る', () => {
  const idle = { left: false, right: false, down: false, rotL: false, rotR: false };
  const p = new Player({ seed: 1 });
  const h = new PracticeHistory<ReturnType<Player['snapshot']>>();
  for (let i = 0; i < 400; i++) {
    p.step({ ...idle, down: true });
    if (p.events.some((e) => e.t === 'spawn')) h.push(p.snapshot());
  }
  const idx = p.tsumoIndex;
  p.restore(h.undo(false)!);
  expect(p.tsumoIndex).toBe(idx - 1);
  expect(p.phase).toBe('control');
});
