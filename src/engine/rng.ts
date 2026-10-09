import type { Color } from './types';

/** eスポ（20th 系）互換の線形合同法。seed = seed * 0x5D588B65 + 0x269EC3 */
export class Lcg {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  get state(): number {
    return this.s;
  }
  /** 0..0xFFFF */
  next(): number {
    this.s = (Math.imul(this.s, 0x5d588b65) + 0x269ec3) >>> 0;
    return this.s >>> 16;
  }
  /** 0..n-1（掛け算とシフトで割る、原作と同じ方式） */
  nextMod(n: number): number {
    return (this.next() * n) >>> 16;
  }
}

function shuffle(rng: Lcg, n: number): number[] {
  const p = Array.from({ length: 256 }, (_, i) => i % n);
  for (const len of [16, 32, 64]) {
    for (let row = 0; row < 256 / len - 1; row++) {
      for (let k = 0; k < len >> 1; k++) {
        const a = row * len + rng.nextMod(len);
        const b = (row + 1) * len + rng.nextMod(len);
        [p[a], p[b]] = [p[b], p[a]];
      }
    }
  }
  return p;
}

/** シード（0..65535）から 128 ペアの配ぷよを作る */
export function generateTsumo(seed: number, colors: 3 | 4 | 5): { colorMap: Color[]; pairs: [Color, Color][] } {
  const rng = new Lcg(seed & 0xffff);
  const left: Color[] = [1, 2, 3, 4, 5];
  const colorMap: Color[] = [];
  for (let n = 5; n > 0; n--) colorMap.push(left.splice(rng.nextMod(n), 1)[0]);
  const pools: Record<number, number[]> = {};
  for (const n of [3, 4, 5]) pools[n] = shuffle(rng, n);
  // 最初の2手は3色以内
  for (const n of [4, 5]) for (let i = 0; i < 4; i++) pools[n][i] = pools[3][i];
  const raw = pools[colors];
  const pairs: [Color, Color][] = [];
  for (let i = 0; i < 256; i += 2) pairs.push([colorMap[raw[i]], colorMap[raw[i + 1]]]);
  return { colorMap, pairs };
}

/** 128 手でループする配ぷよの列 */
export class TsumoQueue {
  private pairs: [Color, Color][];
  constructor(readonly seed: number, readonly colors: 3 | 4 | 5) {
    this.pairs = generateTsumo(seed, colors).pairs;
  }
  get(index: number): [Color, Color] {
    return this.pairs[index % 128];
  }
}
