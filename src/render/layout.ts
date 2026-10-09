import type { Container } from 'pixi.js';

export const BASE_W = 1920;
export const BASE_H = 1080;

/** 全体を 1920×1080 基準で拡大縮小して、画面の中央に置く（余白は黒帯） */
export function fitStage(root: Container, w: number, h: number): void {
  const s = Math.min(w / BASE_W, h / BASE_H);
  root.scale.set(s);
  root.position.set((w - BASE_W * s) / 2, (h - BASE_H * s) / 2);
}

export interface SideLayout {
  /** フィールド内側の左上（12 段目の上端） */
  field: { x: number; y: number };
  cell: number;
  /** NEXT・NEXT2 の枠の左上 */
  next: { x: number; y: number };
  next2: { x: number; y: number };
  /** スコアの中心 */
  score: { x: number; y: number };
  /** 名前バーの中心 */
  name: { x: number; y: number };
  /** 予告ぷよの左上 */
  garbage: { x: number; y: number };
}

/**
 * 2 人対戦の片側の配置。原作の公式マニュアル画面から測った値（設計書 §6.3）。
 * side=0 が 1P（左）、1 が 2P（右）。NEXT は画面中央寄り。
 */
export function versusSide(side: 0 | 1): SideLayout {
  const cell = 60;
  const fieldW = cell * 6;
  const cx = side === 0 ? BASE_W * 0.25 : BASE_W * 0.75;
  const fx = cx - fieldW / 2;
  const fy = 165;
  const inward = side === 0 ? 1 : -1;
  const nextX = side === 0 ? fx + fieldW + 48 : fx - 48 - cell * 1.5;
  return {
    cell,
    field: { x: fx, y: fy },
    next: { x: nextX, y: fy + 10 },
    next2: { x: nextX + inward * cell * 1.1, y: fy + 10 + cell * 2.7 },
    score: { x: cx, y: 930 },
    name: { x: cx, y: 1000 },
    garbage: { x: fx, y: fy - cell * 0.95 },
  };
}
