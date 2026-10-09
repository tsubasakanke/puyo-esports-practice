import { describe, it, expect } from 'vitest';
import { Field, findGroups, clearGroups, applyGravity } from '../../src/engine/field';

describe('Field', () => {
  it('13段目のぷよは連結に数えない', () => {
    // 上から14段目→1段目。13〜10段目に R が4個縦に並ぶ → 1..12段にあるのは3個
    const f = Field.fromStrings([
      '......', 'R.....', 'R.....', 'R.....', 'R.....', '......', '......',
      '......', '......', '......', '......', '......', '......', '......',
    ]);
    expect(findGroups(f)).toEqual([]);
  });
  it('連結判定とおじゃまの巻き込み', () => {
    const f = Field.fromStrings([...Array(10).fill('......'), '......', 'O.....', 'RR....', 'RRO...']);
    const g = findGroups(f);
    expect(g).toHaveLength(1);
    expect(g[0].cells).toHaveLength(4);
    expect(g[0].color).toBe(1);
    clearGroups(f, g);
    expect(f.toStrings().slice(-3)).toEqual(['......', '......', '......']);
  });
  it('おじゃま同士はつながらない', () => {
    const f = Field.fromStrings([...Array(12).fill('......'), 'OO....', 'OO....']);
    expect(findGroups(f)).toEqual([]);
  });
  it('落下は最大段数を返し、14段目に残ったぷよは消える', () => {
    const f = Field.fromStrings(['G.....', ...Array(10).fill('......'), 'R.....', '......', '......']);
    const { maxDrop } = applyGravity(f);
    expect(maxDrop).toBe(2);
    expect(f.get(1, 1)).toBe(1);
    expect(f.get(1, 14)).toBe(0);
  });
  it('fromStrings と toStrings は往復できる', () => {
    const rows = [...Array(11).fill('......'), 'B.Y...', 'RGBYPO', 'OOOOOO'];
    expect(Field.fromStrings(rows).toStrings()).toEqual(rows);
  });
});
