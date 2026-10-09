import { it, expect } from 'vitest';
import { BoardLogWriter, parseBoardLog } from '../../src/net/boardLog';

it('ログを書いて読み戻せる', () => {
  const w = new BoardLogWriter(3);
  w.lock(0, { x: 3, y: 1, dir: 0 }, 11);
  w.garbage(0, [0, 0, 0, 0, 0, 0]);
  w.lock(1, { x: 6, y: 13, dir: 2 }, 0);
  w.garbage(1, [1, 0, 2, 0, 5, 0]);
  const s = w.toString();
  const r = parseBoardLog(s);
  expect(r.round).toBe(3);
  expect(r.placement(0)).toEqual({ x: 3, y: 1, dir: 0, soft: 11 });
  expect(r.placement(1)).toEqual({ x: 6, y: 13, dir: 2, soft: 0 });
  expect(r.garbage(1)).toEqual([1, 0, 2, 0, 5, 0]);
  expect(r.placement(2)).toBeUndefined();
  expect(r.garbage(2)).toBeUndefined();
});

it('壊れたログや空文字は空として扱う', () => {
  expect(parseBoardLog('').placement(0)).toBeUndefined();
  expect(parseBoardLog('xyz').round).toBe(-1);
});

it('300手ぶんでも 20000 文字未満', () => {
  const w = new BoardLogWriter(1);
  for (let i = 0; i < 300; i++) {
    w.lock(i, { x: 6, y: 13, dir: 3 }, 999);
    w.garbage(i, [5, 5, 5, 5, 5, 5]);
  }
  expect(w.toString().length).toBeLessThan(20000);
});
