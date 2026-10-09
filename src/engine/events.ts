import type { Drop } from './field';
import type { Color } from './types';
import type { Dir } from './piece';

export type EngineEvent =
  | { t: 'spawn'; index: number }
  | { t: 'move'; dx: number }
  | { t: 'rotate'; quick: boolean }
  | { t: 'drop'; soft: boolean }
  | {
      t: 'lock';
      cells: { x: number; y: number; c: Color }[];
      /** 固定したときの軸の位置と向き、それまでのソフトドロップ点（オンラインのログ用） */
      x: number;
      y: number;
      dir: Dir;
      soft: number;
    }
  | { t: 'chigiri'; drops: Drop[]; maxDrop: number }
  | {
      t: 'clear';
      chain: number;
      groups: { cells: [number, number][]; color: Color }[];
      garbage: [number, number][];
      score: number;
      /** このリンクで生まれたおじゃま */
      attack: number;
      /** 自分の予告を相殺したあと、相手に送るおじゃま */
      send: number;
    }
  | { t: 'garbage'; count: number; drops: Drop[]; cols: number[] }
  | { t: 'fall'; drops: Drop[]; maxDrop: number }
  | { t: 'chainEnd'; chain: number }
  | { t: 'allClear' }
  | { t: 'dead' };
