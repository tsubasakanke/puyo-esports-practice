import { it, expect } from 'vitest';
import { Match } from '../../src/engine/match';
import { Player } from '../../src/engine/player';
import { BoardLogWriter, parseBoardLog } from '../../src/net/boardLog';
import { CpuController, syncThinker } from '../../src/ai/cpuController';

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) >>> 0) / 0x100000000);
}

function recordGame() {
  const m = new Match({ players: 2, seed: 77 });
  const cpus = [new CpuController(3, syncThinker, rng(1)), new CpuController(4, syncThinker, rng(2))];
  const w = new BoardLogWriter(1);
  // ツモが出るたびの本人の盤面とスコア
  const atSpawn = new Map<number, { field: string; score: number }>();
  let garbageTurns = 0;
  for (let f = 0; f < 60 * 60 * 6 && !m.result; f++) {
    m.step([cpus[0].input(m.players[0], m.players[1]), cpus[1].input(m.players[1], m.players[0])]);
    const me = m.players[0];
    w.observe(me);
    for (const e of me.events) {
      if (e.t === 'spawn') atSpawn.set(e.index, { field: me.field.toStrings().join('/'), score: me.score });
      if (e.t === 'garbage') garbageTurns++;
    }
  }
  return { me: m.players[0], log: w.toString(), atSpawn, garbageTurns };
}

it('ログを再生すると、ツモが出るたびの盤面とスコアが本人と同じで、負けも同じ', { timeout: 60_000 }, () => {
  const { me, log, atSpawn, garbageTurns } = recordGame();
  expect(atSpawn.size).toBeGreaterThan(20);
  expect(garbageTurns).toBeGreaterThan(0); // おじゃまが降るターンも含めて確かめる
  const parsed = parseBoardLog(log);
  const replay = new Player({ seed: 77, replay: parsed });
  let compared = 0;
  for (let f = 0; f < 60 * 60 * 10 && replay.phase !== 'dead'; f++) {
    replay.step({ left: false, right: false, down: false, rotL: false, rotR: false });
    for (const e of replay.events) {
      if (e.t !== 'spawn') continue;
      const want = atSpawn.get(e.index);
      if (!want) continue;
      expect(replay.field.toStrings().join('/')).toBe(want.field);
      expect(replay.score).toBe(want.score);
      compared++;
    }
    // ログが尽きて待っている（相手がまだ置いていない）ところまで来たら終わり
    if (replay.phase === 'control' && !parsed.placement(replay.tsumoIndex - 1)) break;
  }
  expect(compared).toBe(atSpawn.size);
  if (me.phase === 'dead') expect(replay.phase).toBe('dead');
});

it('ログが途中までしかないと、そこで待って壊れない', () => {
  const w = new BoardLogWriter(1);
  w.lock(0, { x: 1, y: 1, dir: 0 }, 0);
  w.garbage(0, [0, 0, 0, 0, 0, 0]);
  const p = new Player({ seed: 5, replay: parseBoardLog(w.toString()) });
  for (let i = 0; i < 2000; i++) p.step({ left: false, right: false, down: false, rotL: false, rotR: false });
  // おじゃまなしのターンは書かれないので、次の手（L1）が届くまでターンの終わりで待つ
  expect(p.tsumoIndex).toBe(1);
  expect(p.phase).toBe('garbage');
  expect(p.field.get(1, 1)).not.toBe(0);
});
