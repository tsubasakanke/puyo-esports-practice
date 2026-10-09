import { marginRate } from './garbage';
import { Player, type FrameInput } from './player';
import type { Rules } from './rules/tsu';

export interface MatchOptions {
  players: number;
  seed: number;
  colors?: 3 | 4 | 5;
  rules?: Partial<Rules>;
  /** プレイヤーごとのルール（DAS・ARR など。省略した人は rules） */
  playerRules?: (Partial<Rules> | undefined)[];
}

export interface MatchResult {
  /** 勝った人の番号。全員同時に負けたら null（引き分け） */
  winner: number | null;
}

/** 2〜4 人の 1 ラウンド。おじゃまの送り先・レート・勝敗を管理する */
export class Match {
  readonly players: Player[];
  frame = 0;
  result: MatchResult | null = null;

  constructor(opts: MatchOptions) {
    this.players = Array.from(
      { length: opts.players },
      (_, i) => new Player({ seed: opts.seed, colors: opts.colors, rules: { ...opts.rules, ...opts.playerRules?.[i] }, garbageSeed: ((opts.seed + 1) * 0x9e37 * (i + 1)) >>> 0 }),
    );
  }

  alive(i: number): boolean {
    return this.players[i].phase !== 'dead';
  }

  /** from の攻撃先 */
  target(from: number): number {
    let best = -1;
    let bestKey: [number, number] = [Infinity, Infinity];
    this.players.forEach((p, i) => {
      if (i === from || !this.alive(i)) return;
      let height = 0;
      for (let x = 1; x <= 6; x++) height += p.field.height(x);
      const key: [number, number] = [p.pendingTotal(), height];
      if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
        best = i;
        bestKey = key;
      }
    });
    return best;
  }

  step(inputs: FrameInput[]): void {
    if (this.result) return;
    this.frame++;
    const rate = marginRate(this.players[0].rules.RATE, this.frame, this.players[0].rules);
    this.players.forEach((p, i) => {
      if (!this.alive(i)) return;
      p.rate = rate;
      p.step(inputs[i]);
    });
    this.players.forEach((p, i) => {
      for (const e of p.events) {
        if (e.t === 'clear' && e.send > 0) {
          const t = this.target(i);
          if (t >= 0) this.players[t].receive(i, e.send);
        } else if (e.t === 'chainEnd') {
          for (const q of this.players) q.confirm(i);
        }
      }
    });
    const living = this.players.map((_, i) => i).filter((i) => this.alive(i));
    if (living.length <= 1) this.result = { winner: living.length === 1 ? living[0] : null };
  }
}
