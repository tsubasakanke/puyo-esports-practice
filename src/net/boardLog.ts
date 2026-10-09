import type { Player, ReplaySource } from '../engine/player';
import type { Dir } from '../engine/piece';

/**
 * オンラインで相手に送る、自分の盤面のログ。
 * 形式: `R{round}|P{予告の数}|L{i}:{x}{dir}{yy},{soft};G{i}:{c1..c6};…`
 * （L = i 手目の置き場所、G = i 手目のターンの終わりに降ったおじゃまの列）
 */
export class BoardLogWriter {
  private tokens: string[] = [];
  private hasG = new Set<number>();
  private changed = false;
  private pendingCount = 0;

  constructor(readonly round: number) {}

  lock(i: number, pos: { x: number; y: number; dir: Dir }, soft: number): void {
    this.tokens.push(`L${i}:${pos.x}${pos.dir}${String(pos.y).padStart(2, '0')},${soft}`);
    this.changed = true;
  }

  garbage(i: number, cols: number[]): void {
    if (this.hasG.has(i)) return;
    this.hasG.add(i);
    this.tokens.push(`G${i}:${cols.map((c) => Math.min(9, c)).join('')}`);
    this.changed = true;
  }

  /** プレイヤーの 1 ステップぶんのイベントからログを足す（予告の数も） */
  observe(p: Player): void {
    const pending = p.pendingTotal();
    if (pending !== this.pendingCount) {
      this.pendingCount = pending;
      this.changed = true;
    }
    for (const e of p.events) {
      const cur = p.tsumoIndex - 1;
      if (e.t === 'lock') this.lock(cur, e, e.soft);
      else if (e.t === 'garbage') this.garbage(cur, e.cols);
      else if (e.t === 'spawn' && e.index > 0) this.garbage(e.index - 1, [0, 0, 0, 0, 0, 0]);
      else if (e.t === 'dead' && cur >= 0) this.garbage(cur, [0, 0, 0, 0, 0, 0]);
    }
  }

  /** 前回から増えていれば true にして、フラグを下ろす */
  takeChanged(): boolean {
    const c = this.changed;
    this.changed = false;
    return c;
  }

  toString(): string {
    return `R${this.round}|P${this.pendingCount}|${this.tokens.join(';')}`;
  }
}

export interface ParsedBoardLog extends ReplaySource {
  round: number;
  /** 書いた人の予告の数 */
  pending: number;
}

/** ログを読む。壊れていたら空のログとして扱う */
export function parseBoardLog(s: string | null | undefined): ParsedBoardLog {
  const placements = new Map<number, { x: number; y: number; dir: Dir; soft: number }>();
  const garbage = new Map<number, number[]>();
  let round = -1;
  let pending = 0;
  const m = /^R(\d+)\|(?:P(\d+)\|)?(.*)$/.exec(s ?? '');
  if (m) {
    round = Number(m[1]);
    pending = Number(m[2] ?? 0);
    for (const tok of m[3].split(';')) {
      const l = /^L(\d+):([1-6])([0-3])(\d\d),(\d+)$/.exec(tok);
      if (l) {
        placements.set(Number(l[1]), { x: Number(l[2]), dir: Number(l[3]) as Dir, y: Number(l[4]), soft: Number(l[5]) });
        continue;
      }
      const g = /^G(\d+):(\d{6})$/.exec(tok);
      if (g) garbage.set(Number(g[1]), [...g[2]].map(Number));
    }
  }
  return {
    round,
    pending,
    placement: (i) => placements.get(i),
    garbage: (i) => garbage.get(i),
  };
}
