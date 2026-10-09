import { it, expect } from 'vitest';
import { FixedLoop } from '../../src/ui/loop';

it('1/60秒ごとに step し、余りを alpha で渡す', () => {
  let steps = 0, alpha = -1;
  const l = new FixedLoop(() => steps++, (a) => (alpha = a));
  l.reset(0);
  l.tick((1000 / 60) * 2.5);
  expect(steps).toBe(2);
  expect(alpha).toBeCloseTo(0.5, 5);
});

it('大きく時間が飛んでも 30 フレームまでしか進めない', () => {
  let steps = 0;
  const l = new FixedLoop(() => steps++, () => {});
  l.reset(0);
  l.tick(10_000);
  expect(steps).toBe(30);
  l.tick(10_000 + 1000 / 60);
  expect(steps).toBe(31);
});

it('maxSteps を大きくすると、そのぶん追いつける', () => {
  let steps = 0;
  const l = new FixedLoop(() => steps++, () => {}, 600);
  l.reset(0);
  l.tick(5000);
  expect(steps).toBe(300);
});
