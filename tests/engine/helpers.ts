import { Player, type FrameInput } from '../../src/engine/player';
import { GARBAGE } from '../../src/engine/types';
import type { Field } from '../../src/engine/field';
import type { EngineEvent } from '../../src/engine/events';

export const idle: FrameInput = { left: false, right: false, down: false, rotL: false, rotR: false };

/** 最初のツモが出るまで進める */
export function untilFirstSpawn(p: Player): void {
  for (let i = 0; i < 100 && !p.piece; i++) p.step(idle);
}

/** 条件を満たすイベントが出るまで input で進めて、それまでのイベントを全部返す */
export function runUntil(p: Player, done: (e: EngineEvent) => boolean, input: FrameInput = idle, limit = 3000): EngineEvent[] {
  const all: EngineEvent[] = [];
  for (let i = 0; i < limit; i++) {
    p.step(input);
    all.push(...p.events);
    if (p.events.some(done)) return all;
  }
  throw new Error('イベントが来なかった');
}

/** 今のツモを (x, dir=0) で置いて、次のツモが出る（か負ける）まで進める */
export function place(p: Player, x: number, colors: [number, number]): EngineEvent[] {
  p.piece = { x, y: 12, dir: 0, colors: colors as [0, 0] };
  return runUntil(p, (e) => e.t === 'spawn' || e.t === 'dead', { ...idle, down: true });
}

export function countGarbage(f: Field): number {
  let n = 0;
  for (let y = 1; y <= 14; y++) for (let x = 1; x <= 6; x++) if (f.get(x, y) === GARBAGE) n++;
  return n;
}
