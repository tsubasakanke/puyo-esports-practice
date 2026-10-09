import { describe, it, expect } from 'vitest';
import { Field } from '../../src/engine/field';
import { tryMove, tryRotate, canPlace, childPos, type PieceState } from '../../src/engine/piece';

const empty = () => Field.fromStrings(Array(14).fill('......'));
const P = (x: number, y: number, dir: 0 | 1 | 2 | 3): PieceState => ({ x, y, dir, colors: [1, 2] });

describe('piece', () => {
  it('子ぷよの位置', () => {
    expect(childPos(P(3, 5, 0))).toEqual([3, 6]);
    expect(childPos(P(3, 5, 1))).toEqual([4, 5]);
    expect(childPos(P(3, 5, 2))).toEqual([3, 4]);
    expect(childPos(P(3, 5, 3))).toEqual([2, 5]);
  });
  it('ふつうの右回転・左回転', () => {
    expect(tryRotate(empty(), P(3, 10, 0), 1, false)!.piece).toMatchObject({ x: 3, y: 10, dir: 1 });
    expect(tryRotate(empty(), P(3, 10, 0), -1, false)!.piece).toMatchObject({ x: 3, y: 10, dir: 3 });
  });
  it('6列目で右回転すると壁蹴りで5列目に寄る', () => {
    const r = tryRotate(empty(), P(6, 10, 0), 1, false)!;
    expect(r.piece).toMatchObject({ x: 5, dir: 1 });
  });
  it('1列目で左回転すると壁蹴りで2列目に寄る', () => {
    expect(tryRotate(empty(), P(1, 10, 0), -1, false)!.piece).toMatchObject({ x: 2, dir: 3 });
  });
  it('床で下向きに回すと1段押し上がる', () => {
    const r = tryRotate(empty(), P(3, 1, 1), 1, false)!;
    expect(r.piece).toMatchObject({ x: 3, y: 2, dir: 2 });
    expect(r.floorKick).toBe(true);
  });
  it('両側ふさがりは2回押しでクイックターン', () => {
    const f = Field.fromStrings(['......', '......', 'RR.RRR', 'RR.RRR', ...Array(10).fill('RRORRR')]);
    const p = P(3, 11, 0);
    expect(tryRotate(f, p, 1, false)).toBeNull();
    const r = tryRotate(f, p, 1, true)!;
    expect(r.quickTurn).toBe(true);
    expect(r.piece.dir).toBe(2);
    expect(r.piece.y).toBe(12); // 子が11段目、軸が12段目
  });
  it('壁の外には動かない', () => {
    expect(tryMove(empty(), P(1, 10, 0), -1)).toBeNull();
    expect(tryMove(empty(), P(1, 10, 0), 1)).toMatchObject({ x: 2 });
    expect(tryMove(empty(), P(5, 10, 1), 1)).toBeNull();
  });
  it('14段目までは入れるが15段目には行けない', () => {
    expect(tryRotate(empty(), P(3, 13, 3), 1, false)!.piece.dir).toBe(0);
    expect(tryRotate(empty(), P(3, 14, 3), 1, false)).toBeNull();
    expect(canPlace(empty(), 3, 14, 2)).toBe(true);
    expect(canPlace(empty(), 3, 14, 0)).toBe(false);
  });
});
