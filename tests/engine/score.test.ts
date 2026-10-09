import { it, expect } from 'vitest';
import { chainStepScore } from '../../src/engine/score';

const g = (n: number, color = 1) => ({ cells: Array.from({ length: n }, (_, i) => [1, i + 1] as [number, number]), color });
it('1連鎖4個は 40 点', () => expect(chainStepScore(1, [g(4)])).toBe(40));
it('2連鎖4個は 4*10*8 = 320 点', () => expect(chainStepScore(2, [g(4)])).toBe(320));
it('連結・色数ボーナス', () => expect(chainStepScore(1, [g(5, 1), g(4, 2)])).toBe(9 * 10 * (2 + 3)));
it('19連鎖の上限', () => expect(chainStepScore(19, [g(4)])).toBe(4 * 10 * 512));
it('11個以上は連結ボーナス 10', () => expect(chainStepScore(1, [g(12)])).toBe(12 * 10 * 10));
