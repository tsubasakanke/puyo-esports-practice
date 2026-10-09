import { Field, applyGravity, clearGroups, findGroups, COLS } from '../engine/field';
import { tryMove, tryRotate, type Dir, type PieceState } from '../engine/piece';
import { chainStepScore } from '../engine/score';
import { type Color, EMPTY, GARBAGE } from '../engine/types';

export interface Placement {
  x: number;
  dir: Dir;
}

export interface ThinkParams {
  /** NEXT を何手先まで読むか（1=今のツモだけ） */
  depth: 1 | 2 | 3;
  /** 1 段ごとに残す候補の数 */
  beam: number;
  /** この連鎖数以上になったら撃つ */
  targetChain: number;
  /** 自分の予告 */
  pending: number;
  /** 相手の予告 */
  enemyPending: number;
}

const SPAWN_X = 3, SPAWN_Y = 12;

/** 出現位置から、横移動と回転（クイックターンも）で行ける置き方 */
export function reachablePlacements(field: Field): Placement[] {
  const start: PieceState = { x: SPAWN_X, y: SPAWN_Y, dir: 0, colors: [1, 1] };
  const key = (p: PieceState) => `${p.x}:${p.y}:${p.dir}`;
  const seen = new Set<string>([key(start)]);
  const queue = [start];
  const out = new Map<string, Placement>();
  while (queue.length) {
    const p = queue.shift()!;
    out.set(`${p.x}:${p.dir}`, { x: p.x, dir: p.dir });
    const nexts: (PieceState | null)[] = [
      tryMove(field, p, -1),
      tryMove(field, p, 1),
      tryRotate(field, p, 1, true)?.piece ?? null,
      tryRotate(field, p, -1, true)?.piece ?? null,
    ];
    for (const n of nexts) {
      if (!n || seen.has(key(n))) continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  return [...out.values()].sort((a, b) => a.x - b.x || a.dir - b.dir);
}

export interface SimResult {
  field: Field;
  chain: number;
  score: number;
  dead: boolean;
}

/** 連鎖を最後まで進める（field を直接書き換える） */
function runChain(f: Field): { chain: number; score: number } {
  let chain = 0, score = 0;
  for (;;) {
    const groups = findGroups(f);
    if (!groups.length) break;
    chain++;
    score += chainStepScore(chain, groups);
    clearGroups(f, groups);
    applyGravity(f);
  }
  return { chain, score };
}

/** ツモを置いて、ちぎりと連鎖を全部終わらせた結果 */
export function simulate(field: Field, pair: [Color, Color], pl: Placement): SimResult {
  const f = field.clone();
  const DX = [0, 1, 0, -1];
  const cx = pl.x + DX[pl.dir];
  if (pl.dir === 0 || pl.dir === 2) {
    const h = f.height(pl.x);
    const [lower, upper] = pl.dir === 0 ? [pair[0], pair[1]] : [pair[1], pair[0]];
    f.set(pl.x, h + 1, lower);
    f.set(pl.x, h + 2, upper);
  } else {
    f.set(pl.x, f.height(pl.x) + 1, pair[0]);
    f.set(cx, f.height(cx) + 1, pair[1]);
  }
  applyGravity(f);
  const { chain, score } = runChain(f);
  return { field: f, chain, score, dead: f.get(3, 12) !== EMPTY };
}

/** (x, y) にある色ぷよとつながっている個数（1..12 段、4 で打ち切り） */
function connectedAtLeast4(f: Field, x: number, y: number): boolean {
  const c = f.get(x, y);
  const seen = new Set<number>([y * 8 + x]);
  const stack: [number, number][] = [[x, y]];
  let n = 0;
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    if (++n >= 4) return true;
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const) {
      if (nx < 1 || nx > COLS || ny < 1 || ny > 12 || seen.has(ny * 8 + nx) || f.get(nx, ny) !== c) continue;
      seen.add(ny * 8 + nx);
      stack.push([nx, ny]);
    }
  }
  return false;
}

/** どこかの列に同じ色を 1〜2 個足したら何連鎖起きるかの最大 */
export function potential(field: Field): number {
  let best = 0;
  for (let x = 1; x <= COLS; x++) {
    const h = field.height(x);
    if (h >= 12) continue;
    // 足す場所に隣り合う色だけ試す
    const colors = new Set<Color>();
    for (const [nx, ny] of [[x - 1, h + 1], [x + 1, h + 1], [x, h]] as const) {
      const c = field.get(nx, ny);
      if (c !== EMPTY && c !== GARBAGE && ny <= 12) colors.add(c);
    }
    for (const c of colors) {
      for (let n = 1; n <= 2 && h + n <= 12; n++) {
        const f = field.clone();
        for (let k = 1; k <= n; k++) f.set(x, h + k, c);
        // 足したぷよが 4 個つながらなければ連鎖は起きない
        if (!connectedAtLeast4(f, x, h + 1)) continue;
        const { chain } = runChain(f);
        if (chain > best) best = chain;
        if (chain > 0) break;
      }
    }
  }
  return best;
}

/** 盤面の形の評価（連鎖の伸びしろ・凸凹・危険度） */
function evaluateShape(f: Field): number {
  const h = Array.from({ length: COLS }, (_, i) => f.height(i + 1));
  let v = 0;
  const pot = potential(f);
  v += pot * pot * 30 + pot * 40;
  // 凸凹（ただし両端が少し高い U 字は許す）
  for (let i = 0; i < COLS - 1; i++) v -= (h[i] - h[i + 1]) ** 2 * 3;
  // 高さ
  if (h[2] >= 10) v -= (h[2] - 9) * 400;
  for (const hh of h) if (hh >= 11) v -= (hh - 10) * 150;
  // 同じ色の隣り合い（3 個までのつながりは連鎖のタネ）
  for (let y = 1; y <= 12; y++) {
    for (let x = 1; x <= COLS; x++) {
      const c = f.get(x, y);
      if (c === EMPTY || c === GARBAGE) continue;
      if (f.get(x + 1, y) === c) v += 8;
      if (y < 12 && f.get(x, y + 1) === c) v += 8;
    }
  }
  // 13 段目のぷよは使えない
  for (let x = 1; x <= COLS; x++) if (f.get(x, 13) !== EMPTY) v -= 60;
  return v;
}

interface Node {
  field: Field;
  first: Placement;
  /** 撃った連鎖の価値（撃っていなければ 0） */
  fire: number;
  value: number;
}

function fireValue(sim: SimResult, depth: number, params: ThinkParams, field: Field): number {
  if (sim.chain === 0) return 0;
  const danger = field.height(3) >= 9 || params.pending >= 18;
  const answers = params.pending >= 6 && sim.score / 70 >= params.pending * 0.6;
  if (sim.chain >= params.targetChain || danger || answers) return 1_000_000 - depth * 100_000 + sim.chain * 5000 + sim.score / 10;
  // 目標に届かない小さい連鎖は、材料がもったいないので少し減点
  return -sim.chain * 120;
}

/** 置き場所を決める */
export function think(field: Field, pieces: [Color, Color][], params: ThinkParams): { placement: Placement; score: number } {
  const depth = Math.min(params.depth, pieces.length);
  let frontier: Node[] = [{ field, first: { x: 3, dir: 0 }, fire: 0, value: 0 }];
  let best: Node | null = null;
  for (let d = 0; d < depth; d++) {
    const next: Node[] = [];
    for (const node of frontier) {
      if (node.fire > 0) {
        next.push(node);
        continue;
      }
      for (const pl of reachablePlacements(node.field)) {
        const sim = simulate(node.field, pieces[d], pl);
        const first = d === 0 ? pl : node.first;
        if (sim.dead) {
          next.push({ field: sim.field, first, fire: 0, value: -1e9 });
          continue;
        }
        const fire = fireValue(sim, d, params, node.field);
        const value = fire > 0 ? fire : evaluateShape(sim.field) + fire + (node.fire < 0 ? node.fire : 0);
        next.push({ field: sim.field, first, fire, value });
      }
    }
    next.sort((a, b) => b.value - a.value);
    frontier = next.slice(0, d === depth - 1 ? 1 : params.beam);
    if (!best || frontier[0].value > best.value || d === depth - 1) best = frontier[0];
  }
  return { placement: best!.first, score: best!.value };
}
