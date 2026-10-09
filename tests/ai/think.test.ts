import { describe, it, expect } from 'vitest';
import { Field } from '../../src/engine/field';
import { reachablePlacements, simulate, potential, think, type ThinkParams } from '../../src/ai/think';
import type { Color } from '../../src/engine/types';

const P = (o: Partial<ThinkParams> = {}): ThinkParams => ({ depth: 1, beam: 8, targetChain: 1, pending: 0, enemyPending: 0, ...o });
const empty = () => Field.fromStrings(Array(14).fill('......'));

describe('reachablePlacements', () => {
  it('空の盤面では 22 通り', () => {
    expect(reachablePlacements(empty())).toHaveLength(22);
  });
  it('2列目と4列目が13段まであると、3列目の縦向き2通りだけ', () => {
    const f = Field.fromStrings(['......', ...Array(13).fill('.O.O..')]);
    const pl = reachablePlacements(f);
    expect(pl.map((p) => `${p.x}:${p.dir}`).sort()).toEqual(['3:0', '3:2']);
  });
});

describe('simulate', () => {
  it('置いて連鎖を最後まで進める', () => {
    const f = Field.fromStrings([...Array(8).fill('......'), 'G.....', 'G.....', 'G.....', 'R.....', 'R.....', 'R.....']);
    const r = simulate(f, [1, 2], { x: 2, dir: 0 });
    expect(r.chain).toBe(2);
    expect(r.field.isEmpty()).toBe(true);
    expect(r.dead).toBe(false);
  });
  it('横置きはちぎれる', () => {
    const f = Field.fromStrings([...Array(13).fill('......'), 'O.....']);
    const r = simulate(f, [1, 2], { x: 1, dir: 1 });
    expect(r.field.get(1, 2)).toBe(1);
    expect(r.field.get(2, 1)).toBe(2);
  });
  it('窒息点が埋まったら dead', () => {
    const f = Field.fromStrings(['......', '......', '......', ...Array(11).fill('..O...')]);
    expect(simulate(f, [1, 2], { x: 3, dir: 0 }).dead).toBe(true);
  });
});

describe('potential', () => {
  it('階段に仕込まれた2連鎖は、1個足せば2連鎖', () => {
    // 1列目 R,R,R,G / 2列目 G,G / 3列目 G。2列目に R を足すと R が消えて G が落ち、G が4個つながる
    const f = Field.fromStrings([...Array(10).fill('......'), 'G.....', 'R.....', 'RG....', 'RGG...']);
    expect(potential(f)).toBe(2);
  });
  it('空なら 0', () => expect(potential(empty())).toBe(0));
});

describe('think', () => {
  it('消せる形では消える置き方を選ぶ（targetChain=1）', () => {
    const f = Field.fromStrings([...Array(11).fill('......'), 'R.....', 'R.....', 'R.....']);
    const r = think(f, [[1, 2], [3, 4]], P());
    const s = simulate(f, [1, 2], r.placement);
    expect(s.chain).toBeGreaterThanOrEqual(1);
  });
  it('2連鎖が撃てて targetChain=2 なら撃つ', () => {
    const f = Field.fromStrings([...Array(8).fill('......'), 'G.....', 'G.....', 'G.....', 'R.....', 'R.....', 'R.....']);
    const r = think(f, [[1, 2], [3, 4]], P({ targetChain: 2 }));
    expect(simulate(f, [1, 2], r.placement).chain).toBe(2);
  });
  it('3列目が11段まで積まれていたら3列目には置かない', () => {
    const f = Field.fromStrings(['......', '......', '......', ...Array(11).fill('..O...')]);
    const r = think(f, [[1, 2], [3, 4]], P({ depth: 2 }));
    expect(r.placement.x === 3 || (r.placement.dir === 1 && r.placement.x === 2) || (r.placement.dir === 3 && r.placement.x === 4)).toBe(false);
  });
  it('depth2・beam8 の思考は速い（中央値 60ms 以内）', () => {
    const f = Field.fromStrings([...Array(8).fill('......'), 'GB....', 'GBY...', 'RYB...', 'RRBY..', 'GGYBB.', 'RRGYYB']);
    const pieces: [Color, Color][] = [[1, 2], [3, 4], [2, 2]];
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      think(f, pieces, P({ depth: 2, beam: 8, targetChain: 8 }));
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    expect(times[2]).toBeLessThan(60);
  });
});
