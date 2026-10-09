import { Field, COLS, ROWS } from './field';
import { type Color, EMPTY } from './types';

/** 子ぷよの向き。0=上, 1=右, 2=下, 3=左 */
export type Dir = 0 | 1 | 2 | 3;

export interface PieceState {
  /** 軸ぷよの列 1..6 */
  x: number;
  /** 軸ぷよの段 1..14 */
  y: number;
  dir: Dir;
  /** [軸, 子] */
  colors: [Color, Color];
}

const DX = [0, 1, 0, -1];
const DY = [1, 0, -1, 0];

export function childPos(p: { x: number; y: number; dir: Dir }): [number, number] {
  return [p.x + DX[p.dir], p.y + DY[p.dir]];
}

function free(f: Field, x: number, y: number): boolean {
  return x >= 1 && x <= COLS && y >= 1 && y <= ROWS && f.get(x, y) === EMPTY;
}

export function canPlace(f: Field, x: number, y: number, dir: Dir): boolean {
  return free(f, x, y) && free(f, x + DX[dir], y + DY[dir]);
}

export function tryMove(f: Field, p: PieceState, dx: number): PieceState | null {
  return canPlace(f, p.x + dx, p.y, p.dir) ? { ...p, x: p.x + dx } : null;
}

export function tryDrop(f: Field, p: PieceState): PieceState | null {
  return canPlace(f, p.x, p.y - 1, p.dir) ? { ...p, y: p.y - 1 } : null;
}

export interface RotateResult {
  piece: PieceState;
  quickTurn: boolean;
  floorKick: boolean;
}

/**
 * 回転。turn=1 が右回り（時計回り）。
 * その場 → 壁蹴り（横向きのとき反対側へ1マス）→ 床蹴り（下向きのとき上へ1段）の順に試す。
 * 左右が両方ふさがっていて回れないときは、quickArmed（直前にも同じ状況で押した）なら上下を入れ替える。
 */
export function tryRotate(f: Field, p: PieceState, turn: 1 | -1, quickArmed: boolean): RotateResult | null {
  const dir = (((p.dir + turn) % 4) + 4) % 4 as Dir;
  if (canPlace(f, p.x, p.y, dir)) return { piece: { ...p, dir }, quickTurn: false, floorKick: false };
  if (dir === 1 || dir === 3) {
    const kx = p.x - DX[dir];
    if (canPlace(f, kx, p.y, dir)) return { piece: { ...p, x: kx, dir }, quickTurn: false, floorKick: false };
    // 両側ふさがり → クイックターン
    if (!quickArmed) return null;
    const flip = (p.dir === 0 ? 2 : 0) as Dir;
    if (canPlace(f, p.x, p.y, flip)) return { piece: { ...p, dir: flip }, quickTurn: true, floorKick: false };
    if (flip === 2 && canPlace(f, p.x, p.y + 1, flip))
      return { piece: { ...p, y: p.y + 1, dir: flip }, quickTurn: true, floorKick: true };
    return null;
  }
  if (dir === 2 && canPlace(f, p.x, p.y + 1, dir))
    return { piece: { ...p, y: p.y + 1, dir }, quickTurn: false, floorKick: true };
  return null;
}
