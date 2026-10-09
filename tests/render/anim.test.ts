import { it, expect } from 'vitest';
import { squash, bounce, fallOffset } from '../../src/render/anim';

it('squash は最初と最後が 1、途中で横に広がる', () => {
  expect(squash(0)).toEqual({ sx: 1, sy: 1 });
  const end = squash(1);
  expect(end.sx).toBeCloseTo(1, 10);
  expect(end.sy).toBeCloseTo(1, 10);
  const m = squash(0.25);
  expect(m.sx).toBeGreaterThan(1.1);
  expect(m.sy).toBeLessThan(0.9);
});

it('範囲外の t は 1 に張り付く', () => {
  expect(squash(-1)).toEqual({ sx: 1, sy: 1 });
  expect(squash(2)).toEqual({ sx: 1, sy: 1 });
});

it('bounce は 0 と 1 で 0、途中は上向き（正）', () => {
  expect(bounce(0)).toBe(0);
  expect(bounce(1)).toBeCloseTo(0, 5);
  expect(bounce(0.2)).toBeGreaterThan(0);
});

it('fallOffset は加速しながら落ちて着地時刻に 0 になる', () => {
  // 3 段を 12F で落ちる: 開始時は 3 段上、終わりで 0
  expect(fallOffset(3, 0, 12)).toBe(3);
  expect(fallOffset(3, 12, 12)).toBe(0);
  expect(fallOffset(3, 20, 12)).toBe(0);
  // 前半は後半よりゆっくり（加速）
  expect(3 - fallOffset(3, 6, 12)).toBeLessThan(fallOffset(3, 6, 12));
});
