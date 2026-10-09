import { describe, it, expect } from 'vitest';
import { Match } from '../../src/engine/match';
import { Field } from '../../src/engine/field';
import { idle } from './helpers';

const full3 = () => Field.fromStrings(['......', '......', ...Array(12).fill('..O...')]);
const inputs = (n: number, down = false) => Array.from({ length: n }, () => ({ ...idle, down }));

function startPieces(m: Match) {
  for (let i = 0; i < 100 && !m.players.every((p) => p.piece); i++) m.step(inputs(m.players.length));
}

describe('Match', () => {
  it('片方が窒息したらもう片方の勝ち。決着後は進まない', () => {
    const m = new Match({ players: 2, seed: 1 });
    m.players[1].field = full3();
    for (let i = 0; i < 200 && !m.result; i++) m.step(inputs(2));
    expect(m.result).toEqual({ winner: 0 });
    const f = m.frame;
    m.step(inputs(2));
    expect(m.frame).toBe(f);
  });

  it('同じフレームに両方負けたら引き分け', () => {
    const m = new Match({ players: 2, seed: 1 });
    m.players[0].field = full3();
    m.players[1].field = full3();
    for (let i = 0; i < 200 && !m.result; i++) m.step(inputs(2));
    expect(m.result).toEqual({ winner: null });
  });

  it('全員同じ配ぷよ、おじゃまの乱数は別々', () => {
    const m = new Match({ players: 2, seed: 9 });
    expect(m.players[0].next(1)).toEqual(m.players[1].next(1));
    expect(m.players[0].next(2)).toEqual(m.players[1].next(2));
  });

  it('攻撃は相手の予告に未確定で積まれ、連鎖が終わると確定する', () => {
    const m = new Match({ players: 2, seed: 1 });
    startPieces(m);
    const [a, b] = m.players;
    a.field = Field.fromStrings([...Array(8).fill('......'), 'G.....', 'G.....', 'G.....', 'R.....', 'R.....', 'R.....']);
    a.piece = { x: 2, y: 12, dir: 0, colors: [1, 2] };
    let sawWaiting = false;
    for (let i = 0; i < 400; i++) {
      m.step([{ ...idle, down: true }, idle]);
      if (b.pendingTotal() === 5 && b.pendingReady() === 0) sawWaiting = true;
      if (a.events.some((e) => e.t === 'chainEnd')) break;
    }
    expect(sawWaiting).toBe(true);
    expect(b.pendingReady()).toBe(5);
  });

  it('4人の攻撃先: 予告が一番少ない相手 → 盤面が一番低い相手 → 番号が小さい相手', () => {
    const m = new Match({ players: 4, seed: 1 });
    startPieces(m);
    const [, b, c, d] = m.players;
    b.receive(9, 6);
    c.receive(9, 1);
    expect(m.target(0)).toBe(3);
    d.receive(9, 1);
    c.field = Field.fromStrings([...Array(13).fill('......'), 'O.....']);
    d.field = Field.fromStrings([...Array(12).fill('......'), 'O.....', 'O.....']);
    expect(m.target(0)).toBe(2);
    c.field = Field.fromStrings(Array(14).fill('......'));
    d.field = Field.fromStrings(Array(14).fill('......'));
    expect(m.target(0)).toBe(2);
  });

  it('負けたプレイヤーの古いイベントは次のフレームに残らない', () => {
    const m = new Match({ players: 3, seed: 1 });
    m.players[2].field = full3();
    for (let i = 0; i < 200 && m.players[2].phase !== 'dead'; i++) m.step(inputs(3));
    expect(m.players[2].events.some((e) => e.t === 'dead')).toBe(true);
    m.step(inputs(3));
    expect(m.players[2].events).toEqual([]);
  });

  it('96秒でレートが 52 になる', () => {
    const m = new Match({ players: 2, seed: 1 });
    m.frame = 96 * 60 - 1;
    m.step(inputs(2));
    expect(m.players[0].rate).toBe(52);
  });
});
