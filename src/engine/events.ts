import type { Drop } from './field';
import type { Color } from './types';

export type EngineEvent =
  | { t: 'spawn'; index: number }
  | { t: 'move'; dx: number }
  | { t: 'rotate'; quick: boolean }
  | { t: 'drop'; soft: boolean }
  | { t: 'lock'; cells: { x: number; y: number; c: Color }[] }
  | { t: 'chigiri'; drops: Drop[]; maxDrop: number }
  | { t: 'clear'; chain: number; groups: { cells: [number, number][]; color: Color }[]; garbage: [number, number][]; score: number }
  | { t: 'fall'; drops: Drop[]; maxDrop: number }
  | { t: 'chainEnd'; chain: number }
  | { t: 'allClear' }
  | { t: 'dead' };
