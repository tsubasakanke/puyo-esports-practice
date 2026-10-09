import { Field } from '../engine/field';
import type { FrameInput, Player } from '../engine/player';
import type { Color } from '../engine/types';
import { reachablePlacements, think, type Placement, type ThinkParams } from './think';

export interface CpuLevel {
  name: string;
  depth: 1 | 2 | 3;
  beam: number;
  /** 1 操作ごとの間隔（F） */
  stepFrames: number;
  /** 置き場所をわざと間違える確率 */
  mistake: number;
  /** この連鎖数で撃つ */
  targetChain: number;
  /** 置き場所に着いたら下を押すか */
  softDrop: boolean;
}

export const CPU_LEVELS: CpuLevel[] = [
  { name: 'よわい', depth: 1, beam: 4, stepFrames: 10, mistake: 0.25, targetChain: 3, softDrop: false },
  { name: 'ふつう', depth: 1, beam: 6, stepFrames: 6, mistake: 0.1, targetChain: 4, softDrop: false },
  { name: 'つよい', depth: 2, beam: 6, stepFrames: 4, mistake: 0.04, targetChain: 6, softDrop: true },
  { name: 'すごい', depth: 2, beam: 8, stepFrames: 2, mistake: 0.01, targetChain: 8, softDrop: true },
  { name: 'おに', depth: 3, beam: 8, stepFrames: 1, mistake: 0, targetChain: 10, softDrop: true },
];

export interface ThinkRequest {
  cells: number[];
  pieces: [Color, Color][];
  params: ThinkParams;
}

export type Thinker = (req: ThinkRequest) => Promise<{ placement: Placement }> | { placement: Placement };

/** その場で考える（テストと、Worker が使えないときの代わり） */
export const syncThinker: Thinker = (req) => think(new Field(Uint8Array.from(req.cells)), req.pieces, req.params);

const defaultWorker = () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

/** Web Worker で考える。作れないか途中で落ちたら、その場で考える（syncThinker）に切り替える */
export function workerThinker(make: () => Worker = defaultWorker): Thinker {
  let worker: Worker;
  try {
    worker = make();
  } catch {
    return syncThinker;
  }
  let broken = false;
  let nextId = 0;
  const waiting = new Map<number, { req: ThinkRequest; resolve: (r: { placement: Placement }) => void }>();
  worker.onmessage = (e: MessageEvent<{ id: number; placement: Placement }>) => {
    waiting.get(e.data.id)?.resolve({ placement: e.data.placement });
    waiting.delete(e.data.id);
  };
  worker.onerror = () => {
    broken = true;
    for (const { req, resolve } of waiting.values()) resolve(syncThinker(req) as { placement: Placement });
    waiting.clear();
  };
  return (req) => {
    if (broken) return syncThinker(req);
    return new Promise((resolve) => {
      const id = nextId++;
      waiting.set(id, { req, resolve });
      worker.postMessage({ id, ...req });
    });
  };
}

const idle = (): FrameInput => ({ left: false, right: false, down: false, rotL: false, rotR: false });

/** CPU の操作。置き場所を考えて、人と同じキー入力で動かす */
export class CpuController {
  readonly level: CpuLevel;
  private piece = -1;
  private plan: Placement | null = null;
  private wait = 0;
  private lastWasTap = false;

  constructor(level: number, private thinker: Thinker, private random: () => number) {
    this.level = CPU_LEVELS[Math.max(0, Math.min(CPU_LEVELS.length - 1, level - 1))];
  }

  private request(p: Player, enemy: Player) {
    const index = p.tsumoIndex;
    this.piece = index;
    this.plan = null;
    const L = this.level;
    const cur = p.piece!;
    const req: ThinkRequest = {
      cells: Array.from(p.field.cells),
      pieces: [[cur.colors[0], cur.colors[1]], p.next(1), p.next(2)],
      params: {
        depth: L.depth,
        beam: L.beam,
        targetChain: L.targetChain,
        pending: p.pendingTotal(),
        enemyPending: enemy.pendingTotal(),
        enemyRoom: Math.max(0, 6 * (12 - enemy.field.height(3))),
        rate: p.rate,
      },
    };
    const field = p.field.clone();
    const accept = (r: { placement: Placement }) => {
      if (this.piece !== index) return;
      let pl = r.placement;
      if (this.random() < L.mistake) {
        const all = reachablePlacements(field);
        pl = all[Math.floor(this.random() * all.length)] ?? pl;
      }
      this.plan = pl;
      this.wait = L.stepFrames;
    };
    const res = this.thinker(req);
    if (res instanceof Promise) res.then(accept);
    else accept(res);
  }

  /** 1 フレームぶんの入力 */
  input(p: Player, enemy: Player): FrameInput {
    const out = idle();
    if (!p.piece) {
      this.lastWasTap = false;
      return out;
    }
    if (p.tsumoIndex !== this.piece) this.request(p, enemy);
    const plan = this.plan;
    if (!plan) return out;
    const cur = p.piece;
    const arrived = cur.dir === plan.dir && cur.x === plan.x;
    if (arrived) {
      out.down = this.level.softDrop;
      return out;
    }
    // 前のフレームにタップしたら、一度離す（押した瞬間でしか動かないため）
    if (this.lastWasTap) {
      this.lastWasTap = false;
      return out;
    }
    if (--this.wait > 0) return out;
    this.wait = this.level.stepFrames;
    if (cur.dir !== plan.dir) {
      const diff = (plan.dir - cur.dir + 4) % 4;
      if (diff === 3) out.rotL = true;
      else out.rotR = true;
    } else if (cur.x < plan.x) out.right = true;
    else out.left = true;
    this.lastWasTap = out.left || out.right;
    return out;
  }
}
