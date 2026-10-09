import { describe, it, expect } from 'vitest';
import { Player } from '../../src/engine/player';
import { Field } from '../../src/engine/field';
import { untilFirstSpawn, place, countGarbage } from './helpers';

/** 1列目に R を3個（その上に G を3個）積んだ盤面。2列目に [R,G] を縦に置くと 2連鎖 */
function twoChainField(): Field {
  return Field.fromStrings([...Array(8).fill('......'), 'G.....', 'G.....', 'G.....', 'R.....', 'R.....', 'R.....']);
}
function oneChainField(): Field {
  return Field.fromStrings([...Array(11).fill('......'), 'R.....', 'R.....', 'R.....']);
}

describe('おじゃまの受け取りと落下', () => {
  it('確定したおじゃまは次のツモの前に降る', () => {
    const p = new Player({ seed: 0 });
    untilFirstSpawn(p);
    p.receive(1, 6);
    p.confirm(1);
    const ev = place(p, 6, [1, 2]);
    expect(ev.some((e) => e.t === 'garbage')).toBe(true);
    expect(countGarbage(p.field)).toBe(6);
    expect(p.pendingTotal()).toBe(0);
  });
  it('未確定のおじゃまは降らない', () => {
    const p = new Player({ seed: 0 });
    untilFirstSpawn(p);
    p.receive(1, 6);
    place(p, 6, [1, 2]);
    expect(countGarbage(p.field)).toBe(0);
    expect(p.pendingTotal()).toBe(6);
  });
  it('30個を超える予告は30個だけ降り、残りは予告に残る', () => {
    const p = new Player({ seed: 0 });
    untilFirstSpawn(p);
    p.receive(1, 40);
    p.confirm(1);
    place(p, 6, [1, 2]);
    expect(countGarbage(p.field)).toBe(30);
    expect(p.pendingTotal()).toBe(10);
  });
});

describe('攻撃と相殺', () => {
  it('2連鎖（40点＋320点）でレート70なら 5 個。予告 3 個を相殺して 2 個送る', () => {
    const p = new Player({ seed: 0 });
    untilFirstSpawn(p);
    p.field = twoChainField();
    p.receive(1, 3);
    p.confirm(1);
    const ev = place(p, 2, [1, 2]);
    const clears = ev.filter((e) => e.t === 'clear');
    expect(clears).toHaveLength(2);
    expect(clears.map((e) => (e.t === 'clear' ? e.attack : -1))).toEqual([0, 5]);
    expect(clears.map((e) => (e.t === 'clear' ? e.send : -1))).toEqual([0, 2]);
    expect(p.pendingTotal()).toBe(0);
    expect(countGarbage(p.field)).toBe(0);
  });
  it('端数は次の連鎖に持ち越す（40点 → 0個、次の40点で合計80 → 1個）', () => {
    const p = new Player({ seed: 0 });
    untilFirstSpawn(p);
    p.field = oneChainField();
    const a = place(p, 2, [1, 2]).find((e) => e.t === 'clear');
    expect(a && a.t === 'clear' && a.attack).toBe(0);
    p.field = oneChainField();
    const b = place(p, 2, [1, 2]).find((e) => e.t === 'clear');
    expect(b && b.t === 'clear' && b.attack).toBe(1);
  });
  it('全消しの次の連鎖は +30 個', () => {
    const p = new Player({ seed: 0 });
    untilFirstSpawn(p);
    p.field = Field.fromStrings([...Array(12).fill('......'), 'R.....', 'RR....']);
    const ev = place(p, 2, [1, 3]); // R が4個つながって消えるが、青(3)が残るので全消しではない
    expect(ev.some((e) => e.t === 'allClear')).toBe(false);
    p.field = Field.fromStrings([...Array(12).fill('......'), 'R.....', 'RR....']);
    const ev2 = place(p, 2, [1, 1]); // 全部消える
    expect(ev2.some((e) => e.t === 'allClear')).toBe(true);
    p.field = oneChainField();
    const c = place(p, 2, [1, 2]).find((e) => e.t === 'clear');
    expect(c && c.t === 'clear' && c.attack).toBeGreaterThanOrEqual(30);
  });
  it('snapshot / restore でおじゃまの状態も戻る', () => {
    const p = new Player({ seed: 0 });
    untilFirstSpawn(p);
    p.receive(1, 7);
    const s = p.snapshot();
    p.confirm(1);
    p.receive(2, 4);
    p.restore(s);
    expect(p.pendingTotal()).toBe(7);
    place(p, 6, [1, 2]);
    expect(countGarbage(p.field)).toBe(0); // 未確定のまま
  });
});
