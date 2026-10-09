import { Field, applyGravity, clearGroups, findGroups, type Drop, type Group } from './field';
import { TSU, type Rules } from './rules/tsu';
import { childPos, tryDrop, tryMove, tryRotate, type Dir, type PieceState } from './piece';
import { Lcg, TsumoQueue } from './rng';
import { dropColumns, garbageFallFrames } from './garbage';
import { chainStepScore } from './score';
import type { EngineEvent } from './events';
import { type Color, EMPTY, GARBAGE } from './types';

/** 1フレームの入力。left/right/down は押しっぱなしの状態、rotL/rotR は押した瞬間 */
export interface FrameInput {
  left: boolean;
  right: boolean;
  down: boolean;
  rotL: boolean;
  rotR: boolean;
}

export type Phase = 'spawnWait' | 'control' | 'chigiri' | 'clear' | 'fall' | 'garbage' | 'dead';

/** クイックターン: 1回目の回転からこのF以内に2回目を押すと上下が入れ替わる */
const QUICK_TURN_WINDOW = 20;

interface State {
  cells: number[];
  piece: PieceState | null;
  phase: Phase;
  timer: number;
  frame: number;
  score: number;
  chain: number;
  tsumoIndex: number;
  fallCounter: number;
  lockTimer: number;
  floorKicks: number;
  busyUntil: number;
  holdL: number;
  holdR: number;
  prevL: boolean;
  prevR: boolean;
  quickArmedAt: number;
  pendingDx: number;
  softDropScore: number;
  allClearPending: boolean;
  clearing: [number, number][];
  rate: number;
  leftover: number;
  garbageReady: number;
  garbageWaiting: Record<number, number>;
  garbageRng: number;
  replayWaiting: boolean;
}

export type PlayerSnapshot = State;

/** オンラインの相手の盤面を再生するときの、置き場所とおじゃまのログ */
export interface ReplaySource {
  /** i 手目の置き場所（まだ届いていなければ undefined） */
  placement(i: number): { x: number; y: number; dir: Dir; soft: number } | undefined;
  /** i 手目のターンの終わりに降ったおじゃまの列（まだ届いていなければ undefined） */
  garbage(i: number): number[] | undefined;
}

export interface PlayerOptions {
  seed: number;
  /** おじゃまが降る列を決める乱数のシード（省略時は seed から作る） */
  garbageSeed?: number;
  colors?: 3 | 4 | 5;
  rules?: Partial<Rules>;
  /** 再生モード。入力の代わりにログどおりに置き、おじゃまもログどおりに降らせる */
  replay?: ReplaySource;
}

/** 1人分のゲーム。step(input) で 1/60 秒進む。描画・通信には依存しない */
export class Player {
  readonly rules: Rules;
  readonly tsumo: TsumoQueue;
  field = new Field();
  piece: PieceState | null = null;
  phase: Phase = 'spawnWait';
  /** 今のフェーズの残りF */
  timer: number;
  frame = 0;
  score = 0;
  /** 今の連鎖数（連鎖していなければ 0） */
  chain = 0;
  /** これまでに出したツモの数。今のツモは get(tsumoIndex-1) */
  tsumoIndex = 0;
  events: EngineEvent[] = [];
  /** 消去中のぷよ（clear フェーズ中だけ） */
  clearing: [number, number][] = [];
  /** 全消しのあと、次の連鎖でボーナスがつく */
  allClearPending = false;
  /** ソフトドロップの得点（次の連鎖の最初のリンクのおじゃま計算に加える） */
  softDropScore = 0;
  /** おじゃまレート（Match がマージンタイムに合わせて毎フレーム設定する） */
  rate: number;
  /** おじゃま計算の端数（次の連鎖に持ち越す） */
  private leftover = 0;
  /** 確定した予告（次のツモの前に降る） */
  private garbageReady = 0;
  /** 未確定の予告（送り主ごと。送り主の連鎖が終わると確定する） */
  private garbageWaiting: Record<number, number> = {};
  private garbageRng: Lcg;
  /** 再生モードのログ */
  replay: ReplaySource | null;
  /** 再生モードで、ターンの終わりのおじゃまのログを待っている */
  private replayWaiting = false;

  private fallCounter = 0;
  private lockTimer = 0;
  private floorKicks = 0;
  private busyUntil = -1;
  private holdL = 0;
  private holdR = 0;
  private prevL = false;
  private prevR = false;
  private quickArmedAt = -1000;
  /** 移動直後の受け付け待ちのあいだに押されたタップ（待ちが終わったら動かす） */
  private pendingDx = 0;

  constructor(opts: PlayerOptions) {
    this.rules = { ...TSU, ...opts.rules };
    this.tsumo = new TsumoQueue(opts.seed, opts.colors ?? 4);
    this.timer = this.rules.FIRST_SPAWN_EXTRA;
    this.rate = this.rules.RATE;
    this.replay = opts.replay ?? null;
    this.garbageRng = new Lcg(opts.garbageSeed ?? (opts.seed * 0x9e37 + 0x1234) >>> 0);
  }

  /** 予告の合計（確定＋未確定） */
  pendingTotal(): number {
    return this.garbageReady + Object.values(this.garbageWaiting).reduce((a, b) => a + b, 0);
  }

  /** 確定した予告 */
  pendingReady(): number {
    return this.garbageReady;
  }

  /** from からのおじゃまを未確定として積む */
  receive(from: number, n: number): void {
    if (n <= 0) return;
    this.garbageWaiting[from] = (this.garbageWaiting[from] ?? 0) + n;
  }

  /** from の連鎖が終わったので、from からのおじゃまを確定する */
  confirm(from: number): void {
    const n = this.garbageWaiting[from];
    if (!n) return;
    this.garbageReady += n;
    delete this.garbageWaiting[from];
  }

  /** 自分の予告を n まで減らす（確定分から先に）。減らした数を返す */
  private offset(n: number): number {
    let left = n;
    const fromReady = Math.min(left, this.garbageReady);
    this.garbageReady -= fromReady;
    left -= fromReady;
    for (const k of Object.keys(this.garbageWaiting)) {
      if (left <= 0) break;
      const key = Number(k);
      const used = Math.min(left, this.garbageWaiting[key]);
      this.garbageWaiting[key] -= used;
      left -= used;
      if (this.garbageWaiting[key] === 0) delete this.garbageWaiting[key];
    }
    return n - left;
  }

  /** 操作中のツモが次の段へ落ちるまでの進み具合 0..1（描画のなめらかな落下用） */
  get fallProgress(): number {
    return this.fallCounter / this.rules.GRAVITY_FRAMES;
  }

  /** n 手先のツモ（1=NEXT, 2=NEXT2） */
  next(n: 1 | 2): [Color, Color] {
    return this.tsumo.get(this.tsumoIndex + n - 1);
  }

  step(input: FrameInput): void {
    this.events = [];
    this.frame++;
    switch (this.phase) {
      case 'spawnWait':
        if (--this.timer <= 0) this.spawn();
        break;
      case 'garbage':
        if (this.replayWaiting && !this.applyReplayGarbage()) break;
        if (--this.timer <= 0) this.spawn();
        break;
      case 'control':
        this.control(input);
        break;
      case 'chigiri':
      case 'fall':
        if (--this.timer <= 0) this.resolve();
        break;
      case 'clear':
        if (--this.timer <= 0) this.finishClear();
        break;
      case 'dead':
        break;
    }
    this.prevL = input.left;
    this.prevR = input.right;
  }

  private emit(e: EngineEvent) {
    this.events.push(e);
  }

  private spawn() {
    const r = this.rules;
    if (r.DEATH_X.some((x) => this.field.get(x, r.DEATH_Y) !== EMPTY)) {
      this.phase = 'dead';
      this.piece = null;
      this.emit({ t: 'dead' });
      return;
    }
    const colors = this.tsumo.get(this.tsumoIndex);
    this.piece = { x: r.SPAWN_X, y: r.SPAWN_Y, dir: 0, colors: [colors[0], colors[1]] };
    this.emit({ t: 'spawn', index: this.tsumoIndex });
    this.tsumoIndex++;
    this.phase = 'control';
    this.fallCounter = 0;
    this.lockTimer = 0;
    this.floorKicks = 0;
    this.busyUntil = -1;
    this.quickArmedAt = -1000;
    this.pendingDx = 0;
    this.chain = 0;
    this.softDropScore = 0;
  }

  private control(input: FrameInput) {
    const r = this.rules;
    let p = this.piece!;

    if (this.replay) {
      // 再生モード: ログの置き場所が届いたら、そこに置いて固定する
      const rec = this.replay.placement(this.tsumoIndex - 1);
      if (!rec) return;
      this.piece = { ...p, x: rec.x, y: rec.y, dir: rec.dir };
      this.score += rec.soft;
      this.softDropScore = rec.soft;
      this.lock();
      return;
    }

    // 回転（1 フレームに 1 回まで。両方押したら右回転を優先）
    const turn = input.rotR ? 1 : input.rotL ? -1 : 0;
    if (turn) {
      const armed = this.frame - this.quickArmedAt <= QUICK_TURN_WINDOW;
      const res = tryRotate(this.field, p, turn, armed);
      if (!res) {
        this.quickArmedAt = this.frame;
      } else {
        this.quickArmedAt = -1000;
        p = res.piece;
        this.emit({ t: 'rotate', quick: res.quickTurn });
        if (res.floorKick && ++this.floorKicks >= r.MAX_FLOOR_KICKS) {
          this.piece = p;
          this.lock();
          return;
        }
      }
    }

    // 横移動（押した瞬間に1マス、長押しは DAS のあと ARR ごと。左右同時は無視）
    const both = input.left && input.right;
    this.holdL = input.left && !both ? this.holdL + 1 : 0;
    this.holdR = input.right && !both ? this.holdR + 1 : 0;
    const wants = (hold: number) => hold === 1 || (hold > r.DAS && (hold - 1 - r.DAS) % r.ARR === 0);
    let dx = wants(this.holdL) ? -1 : wants(this.holdR) ? 1 : 0;
    if (this.frame <= this.busyUntil) {
      // 押した瞬間のタップは、受け付け待ちが終わるまで覚えておく
      if (this.holdL === 1 || this.holdR === 1) this.pendingDx = dx;
      dx = 0;
    } else if (!dx && this.pendingDx) {
      dx = this.pendingDx;
    }
    if (dx) {
      this.pendingDx = 0;
      const moved = tryMove(this.field, p, dx);
      if (moved) {
        p = moved;
        // 横移動したフレームと次のフレームは落下・固定しない（実測の「1列ごとに +2F」に合わせる）
        this.busyUntil = this.frame + 1;
        this.emit({ t: 'move', dx });
      }
    }
    this.piece = p;
    if (this.frame <= this.busyUntil) return;

    // 落下と固定
    const dropped = tryDrop(this.field, p);
    if (dropped) {
      this.fallCounter += input.down ? r.GRAVITY_FRAMES / r.SOFT_DROP_FRAMES : 1;
      if (this.fallCounter >= r.GRAVITY_FRAMES) {
        this.fallCounter -= r.GRAVITY_FRAMES;
        this.piece = dropped;
        if (input.down) {
          this.score += 1;
          this.softDropScore += 1;
        }
        this.emit({ t: 'drop', soft: input.down });
      }
      return;
    }
    this.fallCounter = 0;
    if (input.down || ++this.lockTimer >= r.LOCK_DELAY) this.lock();
  }

  private lock() {
    const p = this.piece!;
    const [cx, cy] = childPos(p);
    const cells: { x: number; y: number; c: Color }[] = [];
    for (const [x, y, c] of [[p.x, p.y, p.colors[0]], [cx, cy, p.colors[1]]] as const) {
      if (this.field.get(x, y) === EMPTY) {
        this.field.set(x, y, c);
        cells.push({ x, y, c });
      }
    }
    this.piece = null;
    this.emit({ t: 'lock', cells, x: p.x, y: p.y, dir: p.dir, soft: this.softDropScore });
    const { maxDrop, drops } = applyGravity(this.field);
    if (maxDrop > 0) {
      this.emit({ t: 'chigiri', drops, maxDrop });
      this.phase = 'chigiri';
      this.timer = this.rules.CHIGIRI_EXTRA[Math.min(maxDrop, this.rules.CHIGIRI_EXTRA.length - 1)];
      return;
    }
    this.resolve();
  }

  /** 盤面が落ち着いたときの処理: 消せるなら消去へ、なければターン終了 */
  private resolve() {
    const groups = findGroups(this.field);
    if (groups.length > 0) {
      this.startClear(groups);
      return;
    }
    if (this.chain > 0) {
      this.emit({ t: 'chainEnd', chain: this.chain });
      if (this.field.isEmpty()) {
        this.allClearPending = true;
        this.emit({ t: 'allClear' });
      }
    }
    this.phase = 'garbage';
    this.timer = this.rules.NEXT_DELAY;
    if (this.replay) {
      this.replayWaiting = true;
      if (!this.applyReplayGarbage()) return;
    } else if (this.garbageReady > 0) {
      const n = Math.min(this.garbageReady, this.rules.MAX_GARBAGE_DROP);
      this.garbageReady -= n;
      this.dropGarbage(dropColumns(n, this.garbageRng));
    }
    if (this.timer <= 0) this.spawn();
  }

  /** 再生モード: このターンのおじゃまのログが届いていれば降らせる。届いていなければ false */
  private applyReplayGarbage(): boolean {
    const cols = this.replay!.garbage(this.tsumoIndex - 1);
    if (!cols) return false;
    this.replayWaiting = false;
    if (cols.some((c) => c > 0)) this.dropGarbage(cols);
    return true;
  }

  /** 各列に cols 個ずつおじゃまを降らせる */
  private dropGarbage(cols: number[]) {
    const r = this.rules;
    const n = cols.reduce((a, b) => a + b, 0);
    const heights = cols.map((_, i) => this.field.height(i + 1));
    const drops: Drop[] = [];
    cols.forEach((k, i) => {
      const x = i + 1;
      for (let j = 0; j < k; j++) {
        const y = heights[i] + 1 + j;
        // 14 段目より上には置けない（あふれた分はなくなる）
        if (y > 13) break;
        this.field.set(x, y, GARBAGE);
        drops.push({ x, from: 14 + j + 1, to: y });
      }
    });
    this.emit({ t: 'garbage', count: n, drops, cols: [...cols] });
    const fall = garbageFallFrames(cols, heights, r.GARBAGE_LAND_FRAMES, r.GARBAGE_LAND_PER_ROW);
    this.timer = Math.max(this.timer, fall);
  }

  private pendingGroups: Group[] = [];

  private startClear(groups: Group[]) {
    this.chain++;
    const score = chainStepScore(this.chain, groups);
    this.score += score;
    this.pendingGroups = groups;
    this.clearing = groups.flatMap((g) => g.cells);
    const probe = this.field.clone();
    const garbage = clearGroups(probe, groups);
    this.clearing.push(...garbage);
    let total = score + this.leftover;
    if (this.chain === 1) {
      total += this.softDropScore;
      this.softDropScore = 0;
    }
    let attack = Math.floor(total / this.rate);
    this.leftover = total - attack * this.rate;
    if (this.chain === 1 && this.allClearPending) {
      attack += this.rules.ALL_CLEAR_BONUS;
      this.allClearPending = false;
    }
    const send = attack - this.offset(attack);
    this.emit({ t: 'clear', chain: this.chain, groups, garbage, score, attack, send });
    this.phase = 'clear';
    this.timer = this.rules.CLEAR_FRAMES;
  }

  private finishClear() {
    clearGroups(this.field, this.pendingGroups);
    this.pendingGroups = [];
    this.clearing = [];
    const { maxDrop, drops } = applyGravity(this.field);
    if (maxDrop > 0) {
      this.emit({ t: 'fall', drops, maxDrop });
      this.phase = 'fall';
      this.timer = this.rules.DROP_BASE + this.rules.DROP_PER_ROW * (maxDrop - 1);
      return;
    }
    this.resolve();
  }

  snapshot(): PlayerSnapshot {
    return structuredClone({
      cells: Array.from(this.field.cells),
      piece: this.piece,
      phase: this.phase,
      timer: this.timer,
      frame: this.frame,
      score: this.score,
      chain: this.chain,
      tsumoIndex: this.tsumoIndex,
      fallCounter: this.fallCounter,
      lockTimer: this.lockTimer,
      floorKicks: this.floorKicks,
      busyUntil: this.busyUntil,
      holdL: this.holdL,
      holdR: this.holdR,
      prevL: this.prevL,
      prevR: this.prevR,
      quickArmedAt: this.quickArmedAt,
      pendingDx: this.pendingDx,
      softDropScore: this.softDropScore,
      allClearPending: this.allClearPending,
      clearing: this.clearing,
      rate: this.rate,
      leftover: this.leftover,
      garbageReady: this.garbageReady,
      garbageWaiting: this.garbageWaiting,
      garbageRng: this.garbageRng.state,
      replayWaiting: this.replayWaiting,
      pendingGroups: this.pendingGroups,
    } as State & { pendingGroups: Group[] });
  }

  restore(s: PlayerSnapshot): void {
    const c = structuredClone(s) as State & { pendingGroups: Group[] };
    this.field = new Field(Uint8Array.from(c.cells));
    this.piece = c.piece;
    this.phase = c.phase;
    this.timer = c.timer;
    this.frame = c.frame;
    this.score = c.score;
    this.chain = c.chain;
    this.tsumoIndex = c.tsumoIndex;
    this.fallCounter = c.fallCounter;
    this.lockTimer = c.lockTimer;
    this.floorKicks = c.floorKicks;
    this.busyUntil = c.busyUntil;
    this.holdL = c.holdL;
    this.holdR = c.holdR;
    this.prevL = c.prevL;
    this.prevR = c.prevR;
    this.quickArmedAt = c.quickArmedAt;
    this.pendingDx = c.pendingDx ?? 0;
    this.softDropScore = c.softDropScore;
    this.allClearPending = c.allClearPending;
    this.clearing = c.clearing;
    this.pendingGroups = c.pendingGroups ?? [];
    this.rate = c.rate;
    this.leftover = c.leftover;
    this.garbageReady = c.garbageReady;
    this.garbageWaiting = c.garbageWaiting;
    this.garbageRng = new Lcg(c.garbageRng);
    this.replayWaiting = c.replayWaiting ?? false;
    this.events = [];
  }
}
