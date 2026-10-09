import { type Color, EMPTY, GARBAGE } from './types';

export const COLS = 6;
export const ROWS = 14;
export const VISIBLE = 12;
export const HIDDEN_ROW = 13;

const CHARS = '.RGBYPO';

export interface Group {
  cells: [number, number][];
  color: Color;
}

/** 6列×14段の盤面。座標は x=1..6（左から）、y=1..14（下から） */
export class Field {
  readonly cells: Uint8Array;

  constructor(cells?: Uint8Array) {
    this.cells = cells ?? new Uint8Array(COLS * ROWS);
  }

  static inside(x: number, y: number): boolean {
    return x >= 1 && x <= COLS && y >= 1 && y <= ROWS;
  }

  get(x: number, y: number): Color {
    if (!Field.inside(x, y)) return EMPTY;
    return this.cells[(y - 1) * COLS + (x - 1)] as Color;
  }

  set(x: number, y: number, c: Color): void {
    if (Field.inside(x, y)) this.cells[(y - 1) * COLS + (x - 1)] = c;
  }

  clone(): Field {
    return new Field(this.cells.slice());
  }

  /** その列で一番上にあるぷよの段（空なら 0） */
  height(x: number): number {
    for (let y = ROWS; y >= 1; y--) if (this.get(x, y) !== EMPTY) return y;
    return 0;
  }

  isEmpty(): boolean {
    return this.cells.every((c) => c === EMPTY);
  }

  /** 上の段（14段目）から1段目まで、14行の文字列。'.RGBYPO' */
  static fromStrings(rows: string[]): Field {
    const f = new Field();
    rows.forEach((row, i) => {
      const y = rows.length - i;
      for (let x = 1; x <= COLS; x++) f.set(x, y, Math.max(0, CHARS.indexOf(row[x - 1] ?? '.')) as Color);
    });
    return f;
  }

  toStrings(): string[] {
    const out: string[] = [];
    for (let y = ROWS; y >= 1; y--) {
      let s = '';
      for (let x = 1; x <= COLS; x++) s += CHARS[this.get(x, y)];
      out.push(s);
    }
    return out;
  }
}

const DIRS: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]];

/** 1..12段にある、4個以上つながった色ぷよのグループ */
export function findGroups(f: Field, minSize = 4): Group[] {
  const seen = new Uint8Array(COLS * ROWS);
  const groups: Group[] = [];
  for (let y = 1; y <= VISIBLE; y++) {
    for (let x = 1; x <= COLS; x++) {
      const color = f.get(x, y);
      const i = (y - 1) * COLS + (x - 1);
      if (color === EMPTY || color === GARBAGE || seen[i]) continue;
      const cells: [number, number][] = [];
      const stack: [number, number][] = [[x, y]];
      seen[i] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        cells.push([cx, cy]);
        for (const [dx, dy] of DIRS) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 1 || nx > COLS || ny < 1 || ny > VISIBLE) continue;
          const ni = (ny - 1) * COLS + (nx - 1);
          if (seen[ni] || f.get(nx, ny) !== color) continue;
          seen[ni] = 1;
          stack.push([nx, ny]);
        }
      }
      if (cells.length >= minSize) groups.push({ cells, color });
    }
  }
  return groups;
}

/** グループと、それに隣接する（1..12段の）おじゃまを消す。消したおじゃまの座標を返す */
export function clearGroups(f: Field, groups: Group[]): [number, number][] {
  const garbage: [number, number][] = [];
  for (const g of groups) {
    for (const [x, y] of g.cells) {
      f.set(x, y, EMPTY);
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (ny <= VISIBLE && f.get(nx, ny) === GARBAGE) {
          f.set(nx, ny, EMPTY);
          garbage.push([nx, ny]);
        }
      }
    }
  }
  return garbage;
}

export interface Drop {
  x: number;
  from: number;
  to: number;
}

/** 14段目を消してから、ぷよを下に詰める */
export function applyGravity(f: Field): { maxDrop: number; drops: Drop[] } {
  for (let x = 1; x <= COLS; x++) f.set(x, ROWS, EMPTY);
  let maxDrop = 0;
  const drops: Drop[] = [];
  for (let x = 1; x <= COLS; x++) {
    let to = 1;
    for (let y = 1; y <= ROWS; y++) {
      const c = f.get(x, y);
      if (c === EMPTY) continue;
      if (y !== to) {
        f.set(x, to, c);
        f.set(x, y, EMPTY);
        drops.push({ x, from: y, to });
        maxDrop = Math.max(maxDrop, y - to);
      }
      to++;
    }
  }
  return { maxDrop, drops };
}
