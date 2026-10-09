import { describe, it, expect } from 'vitest';
import { generateTsumo, TsumoQueue } from '../../src/engine/rng';

// Puyo Nexus の参照 Python 実装の出力（色マップ前のプール値）。index 0..31
const RAW4: Record<number, string> = {
  0x0000: '00202323011121120003113221330223',
  0x0001: '01211123310322221121033310331223',
  0x1234: '01001022101320201302223223203331',
  0xffff: '02220113001330100123112323200003',
};
const MAP: Record<number, string> = { 0x0000: 'RBPYG', 0x0001: 'GPRBY', 0x1234: 'RGBPY', 0xffff: 'RPYGB' };
const LETTER = ['', 'R', 'G', 'B', 'Y', 'P'];

describe('generateTsumo', () => {
  for (const seed of Object.keys(RAW4).map(Number)) {
    it(`seed ${seed.toString(16)} は参照実装と一致する`, () => {
      const { colorMap, pairs } = generateTsumo(seed, 4);
      expect(colorMap.map((c) => LETTER[c]).join('')).toBe(MAP[seed]);
      const raw = pairs.flat().slice(0, 32).map((c) => colorMap.indexOf(c)).join('');
      expect(raw).toBe(RAW4[seed]);
    });
  }
  it('3色・5色も参照実装と一致し、最初の2手は3色プールと同じ', () => {
    const t3 = generateTsumo(0, 3), t5 = generateTsumo(0, 5);
    expect(t3.pairs.flat().slice(0, 16).map((c) => t3.colorMap.indexOf(c)).join('')).toBe('0020112102101011');
    expect(t5.pairs.flat().slice(0, 16).map((c) => t5.colorMap.indexOf(c)).join('')).toBe('0020411231213120');
  });
  it('128ペアでループする', () => {
    const q = new TsumoQueue(7, 4);
    expect(q.get(128)).toEqual(q.get(0));
    expect(q.get(300)).toEqual(q.get(300 - 256));
  });
});
