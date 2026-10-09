import { describe, it, expect } from 'vitest';
import { Player, type FrameInput } from '../../src/engine/player';
import { Field } from '../../src/engine/field';
import type { Color } from '../../src/engine/types';

const idle: FrameInput = { left: false, right: false, down: false, rotL: false, rotR: false };

/** 軸を targetX へ運んで（タップは 2F ごと）下を押しっぱなしで落とし、次の spawn までのフレーム数を返す */
function framesToNextSpawn(p: Player, targetX: number): number {
  const start = p.frame;
  let tap = false;
  for (let i = 0; i < 2000; i++) {
    const cur = p.piece;
    const dx = cur ? targetX - cur.x : 0;
    tap = !tap;
    p.step({ ...idle, down: true, left: dx < 0 && tap, right: dx > 0 && tap });
    // 12段目に置いたときは窒息するので、次のツモの代わりに負けが同じタイミングで来る
    if (p.events.some((e) => e.t === 'spawn' || e.t === 'dead')) return p.frame - start;
  }
  throw new Error('spawn しなかった');
}

function untilFirstSpawn(p: Player): number {
  for (let i = 0; i < 100; i++) {
    p.step(idle);
    if (p.events.some((e) => e.t === 'spawn')) return p.frame;
  }
  throw new Error('spawn しなかった');
}

/** 最初のツモが出た直後の Player の盤面を、各列の高さぶんおじゃまで埋める */
function playerWithStack(heights: number[]): Player {
  const p = new Player({ seed: 0 });
  untilFirstSpawn(p);
  p.field = Field.fromStrings(
    Array.from({ length: 14 }, (_, r) => heights.map((h) => (14 - r <= h ? 'O' : '.')).join('')),
  );
  return p;
}

describe('設置フレーム（実測: puyo-camp.jp/posts/71019）', () => {
  it('1手目は開始から 7F で出る', () => {
    expect(untilFirstSpawn(new Player({ seed: 0 }))).toBe(7);
  });
  it('3列目12段目に置く = 28F', () => {
    expect(framesToNextSpawn(playerWithStack([0, 0, 11, 0, 0, 0]), 3)).toBe(28);
  });
  it('3列目1段目 = 50F', () => {
    expect(framesToNextSpawn(playerWithStack([0, 0, 0, 0, 0, 0]), 3)).toBe(50);
  });
  it('6列目1段目 = 56F', () => {
    expect(framesToNextSpawn(playerWithStack([0, 0, 0, 0, 0, 0]), 6)).toBe(56);
  });
  it('1列目1段目 = 54F', () => {
    expect(framesToNextSpawn(playerWithStack([0, 0, 0, 0, 0, 0]), 1)).toBe(54);
  });
  it('6列目12段目 = 34F', () => {
    expect(framesToNextSpawn(playerWithStack([0, 0, 11, 11, 11, 11]), 6)).toBe(34);
  });
});

describe('ちぎりと連鎖のフレーム', () => {
  it('段差1のちぎりは +19F', () => {
    const p = playerWithStack([0, 0, 1, 0, 0, 0]);
    p.piece = { ...p.piece!, dir: 1 };
    expect(framesToNextSpawn(p, 3)).toBe(28 + 2 * 10 + 19);
  });
  it('段差5のちぎりは +34F', () => {
    const p = playerWithStack([0, 0, 5, 0, 0, 0]);
    p.piece = { ...p.piece!, dir: 1 };
    expect(framesToNextSpawn(p, 3)).toBe(28 + 2 * 6 + 34);
  });
  it('1連鎖（落下なし）は +55F', () => {
    const p = playerWithStack([0, 0, 0, 0, 0, 0]);
    const a: Color = 1;
    p.field.set(3, 1, a);
    p.field.set(3, 2, a);
    p.piece = { ...p.piece!, colors: [a, a] };
    // 軸は 3 段目に着地 → 12→3 で 9 段
    expect(framesToNextSpawn(p, 3)).toBe(28 + 2 * 9 + 55);
  });
  it('1連鎖（上に乗っていたぷよが3段落ちる）は +80+2*2F', () => {
    const p = playerWithStack([0, 0, 0, 0, 0, 0]);
    // 1列目: 赤3個の上に緑3個。赤の右（2列目1段目）に赤ツモの軸を置く
    for (let y = 1; y <= 3; y++) p.field.set(1, y, 1);
    for (let y = 4; y <= 6; y++) p.field.set(1, y, 2);
    p.piece = { ...p.piece!, colors: [1, 3] };
    // 2列目: 軸(赤)が1段目、子(青)が2段目 → 赤4個が消えて緑が3段落ちる
    expect(framesToNextSpawn(p, 2)).toBe(28 + 2 * 11 + 2 + 80 + 2 * 2);
  });
});
