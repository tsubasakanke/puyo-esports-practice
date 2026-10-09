import { describe, it, expect } from 'vitest';
import { queueIcons, dropColumns, garbageFallFrames, garbageStun, marginRate } from '../../src/engine/garbage';
import { Lcg } from '../../src/engine/rng';
import { TSU } from '../../src/engine/rules/tsu';

describe('queueIcons', () => {
  it('大きい単位から、最大6個', () => {
    expect(queueIcons(0)).toEqual([]);
    expect(queueIcons(5)).toEqual(['small', 'small', 'small', 'small', 'small']);
    expect(queueIcons(7)).toEqual(['large', 'small']);
    expect(queueIcons(37)).toEqual(['rock', 'large', 'small']);
    expect(queueIcons(180 + 360 + 6)).toEqual(['moon', 'star', 'large']);
    expect(queueIcons(1440 + 720 + 5)).toEqual(['comet', 'crown', 'small', 'small', 'small', 'small']);
  });
});

describe('dropColumns', () => {
  it('6の倍数は均等、端数は別々の列に1個ずつ', () => {
    for (let seed = 0; seed < 20; seed++) {
      const cols = dropColumns(14, new Lcg(seed));
      expect(cols).toHaveLength(6);
      expect(cols.reduce((a, b) => a + b)).toBe(14);
      expect(cols.filter((c) => c === 3)).toHaveLength(2);
      expect(cols.filter((c) => c === 2)).toHaveLength(4);
    }
  });
  it('30個は5段ぴったり、0個は何も降らない', () => {
    expect(dropColumns(30, new Lcg(1))).toEqual([5, 5, 5, 5, 5, 5]);
    expect(dropColumns(0, new Lcg(1))).toEqual([0, 0, 0, 0, 0, 0]);
  });
  it('端数の列はシードで変わる（いつも同じ列ではない）', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 30; seed++) seen.add(dropColumns(1, new Lcg(seed)).join(''));
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe('garbageStun', () => {
  it('実測の硬直', () => {
    expect(garbageStun(8)).toBe(0);
    expect(garbageStun(9)).toBe(1);
    expect(garbageStun(18)).toBe(15);
    expect(garbageStun(30)).toBe(25);
  });
});

describe('garbageFallFrames', () => {
  it('空の盤面に1個ずつなら、降った列の着地Fの最大', () => {
    // 2列目(59F)と4列目(56F)に降る
    expect(garbageFallFrames([0, 1, 0, 1, 0, 0], [0, 0, 0, 0, 0, 0])).toBe(59);
    expect(garbageFallFrames([1, 1, 1, 1, 1, 1], [0, 0, 0, 0, 0, 0])).toBe(64);
  });
  it('積まれている列は着地が早い、量が多いと硬直が足される', () => {
    expect(garbageFallFrames([0, 0, 1, 0, 0, 0], [0, 0, 10, 0, 0, 0])).toBeLessThan(64);
    expect(garbageFallFrames([5, 5, 5, 5, 5, 5], [0, 0, 0, 0, 0, 0])).toBe(64 + 25);
  });
});

describe('marginRate', () => {
  it('96秒から16秒ごとに 70→52→35→26→17→13→8→6→4→3→2→1', () => {
    const table = [70, 52, 35, 26, 17, 13, 8, 6, 4, 3, 2, 1, 1, 1];
    expect(marginRate(70, 96 * 60 - 1, TSU)).toBe(70);
    table.forEach((rate, i) => {
      if (i === 0) return;
      expect(marginRate(70, (96 + 16 * (i - 1)) * 60, TSU)).toBe(rate);
    });
  });
});
