import { it, expect } from 'vitest';
import { Player } from '../../src/engine/player';
import { Field } from '../../src/engine/field';

const idle = { left: false, right: false, down: false, rotL: false, rotR: false };

it('同じシード・同じ入力なら同じ結果（決定性）', () => {
  const run = () => {
    const p = new Player({ seed: 42 });
    for (let i = 0; i < 3000; i++) p.step({ ...idle, down: i % 3 === 0, left: i % 50 < 3, rotR: i % 40 === 0 });
    return JSON.stringify(p.snapshot());
  };
  expect(run()).toBe(run());
});

it('窒息点が埋まっていると負け', () => {
  const p = new Player({ seed: 1 });
  p.field = Field.fromStrings(['......', '......', ...Array(12).fill('..O...')]);
  for (let i = 0; i < 400 && p.phase !== 'dead'; i++) p.step({ ...idle, down: true });
  expect(p.phase).toBe('dead');
});

it('snapshot / restore で元に戻せる', () => {
  const p = new Player({ seed: 3 });
  for (let i = 0; i < 30; i++) p.step(idle);
  const s = p.snapshot();
  const before = JSON.stringify(s);
  for (let i = 0; i < 200; i++) p.step({ ...idle, down: true });
  p.restore(s);
  expect(JSON.stringify(p.snapshot())).toBe(before);
});

it('左右同時押しは動かない', () => {
  const p = new Player({ seed: 3 });
  for (let i = 0; i < 10; i++) p.step(idle);
  const x = p.piece!.x;
  for (let i = 0; i < 20; i++) p.step({ ...idle, left: true, right: true });
  expect(p.piece!.x).toBe(x);
});

it('長押しで DAS のあと ARR ごとに動く', () => {
  const p = new Player({ seed: 3 });
  for (let i = 0; i < 10; i++) p.step(idle);
  p.step({ ...idle, right: true }); // 押した瞬間に 1 マス
  expect(p.piece!.x).toBe(4);
  for (let i = 0; i < 7; i++) p.step({ ...idle, right: true });
  expect(p.piece!.x).toBe(4); // まだ DAS 中
  p.step({ ...idle, right: true });
  expect(p.piece!.x).toBe(5);
  p.step({ ...idle, right: true });
  p.step({ ...idle, right: true });
  expect(p.piece!.x).toBe(6);
});

it('DAS / ARR は rules で変えられる', () => {
  const p = new Player({ seed: 3, rules: { DAS: 4, ARR: 1 } });
  for (let i = 0; i < 10; i++) p.step(idle);
  for (let i = 0; i < 5; i++) p.step({ ...idle, right: true });
  expect(p.piece!.x).toBe(5);
});

it('128手を超えてもツモがループして続く', () => {
  const a = new Player({ seed: 5 }), b = new Player({ seed: 5 });
  a.tsumoIndex = 300;
  b.tsumoIndex = 300 - 256;
  expect(a.next(1)).toEqual(b.next(1));
  expect(a.next(2)).toEqual(b.next(2));
});

it('何もしなくても自然落下して積み上がり、いつか負ける', () => {
  const p = new Player({ seed: 9 });
  for (let i = 0; i < 60 * 60 * 5 && p.phase !== 'dead'; i++) p.step(idle);
  expect(p.phase).toBe('dead');
});

it('14段目に回したぷよは設置後に消える', () => {
  const p = new Player({ seed: 9 });
  for (let i = 0; i < 10; i++) p.step(idle);
  // 1〜3列目を12段まで埋め、軸を13段目・子を14段目に置いた状態で固定させる
  p.field = Field.fromStrings(['......', '......', ...Array(12).fill('OOO...')]);
  p.piece = { x: 2, y: 13, dir: 1, colors: [1, 2] }; // 軸(2,13) 子(3,13)
  p.step(idle);
  p.step({ ...idle, rotL: true }); // 子を上(2,14)へ
  for (let i = 0; i < 200 && !p.events.some((e) => e.t === 'lock'); i++) p.step({ ...idle, down: true });
  expect(p.field.get(2, 14)).toBe(0);
});
