import type { Lcg } from './rng';
import type { Rules } from './rules/tsu';

export type IconKind = 'small' | 'large' | 'rock' | 'star' | 'moon' | 'crown' | 'comet';

const UNITS: [IconKind, number][] = [
  ['comet', 1440],
  ['crown', 720],
  ['moon', 360],
  ['star', 180],
  ['rock', 30],
  ['large', 6],
  ['small', 1],
];

/** 予告の表示。大きい単位から並べて最大 max 個 */
export function queueIcons(n: number, max = 6): IconKind[] {
  const out: IconKind[] = [];
  let rest = Math.max(0, Math.floor(n));
  for (const [kind, unit] of UNITS) {
    while (rest >= unit && out.length < max) {
      out.push(kind);
      rest -= unit;
    }
  }
  return out;
}

/** n 個（30 以下）を各列にいくつ降らせるか。6 の倍数ぶんは均等、端数は別々の列に 1 個ずつ */
export function dropColumns(n: number, rng: Lcg): number[] {
  const cols = Array(6).fill(Math.floor(n / 6));
  const order = [0, 1, 2, 3, 4, 5];
  for (let i = 0; i < n % 6; i++) {
    const j = i + rng.nextMod(6 - i);
    [order[i], order[j]] = [order[j], order[i]];
    cols[order[i]]++;
  }
  return cols;
}

/** おじゃまが着地したあとの硬直（実測: 8 個以下 0、9 個 1 … 18 個 15、30 個 25） */
export function garbageStun(n: number): number {
  if (n <= 8) return 0;
  if (n <= 18) return Math.round(1 + ((n - 9) * 14) / 9);
  return Math.round(15 + ((Math.min(n, 30) - 18) * 10) / 12);
}

/** おじゃまが全部着地して、次のツモが出せるようになるまでの F */
export function garbageFallFrames(
  columns: number[],
  heights: number[],
  land: number[] = [60, 59, 64, 56, 62, 58],
  perRow = 2,
): number {
  let max = 0;
  columns.forEach((c, i) => {
    if (c > 0) max = Math.max(max, land[i] - perRow * heights[i]);
  });
  return max + garbageStun(columns.reduce((a, b) => a + b, 0));
}

/** マージンタイムを反映したレート。1 回目は ×3/4、2 回目以降は 2 つ前のレートの半分（切り捨て） */
export function marginRate(base: number, frame: number, rules: Pick<Rules, 'MARGIN_START_FRAMES' | 'MARGIN_STEP_FRAMES' | 'MARGIN_MAX_STEPS'>): number {
  if (frame < rules.MARGIN_START_FRAMES) return base;
  const steps = Math.min(rules.MARGIN_MAX_STEPS, 1 + Math.floor((frame - rules.MARGIN_START_FRAMES) / rules.MARGIN_STEP_FRAMES));
  const rates = [base, Math.floor((base * 3) / 4)];
  for (let i = 2; i <= steps; i++) rates.push(Math.max(1, Math.floor(rates[i - 2] / 2)));
  return Math.max(1, rates[steps]);
}
