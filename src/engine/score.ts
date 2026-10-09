export const CHAIN_BONUS = [0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 480, 512];
export const COLOR_BONUS = [0, 0, 3, 6, 12, 24];
export const GROUP_BONUS = (n: number): number => (n >= 11 ? 10 : [0, 0, 0, 0, 0, 2, 3, 4, 5, 6, 7][n]);

/** 1連鎖ぶんの得点 = 消した個数 × 10 × clamp(連鎖＋連結＋色数ボーナス, 1, 999) */
export function chainStepScore(chain: number, groups: { cells: unknown[]; color: number }[]): number {
  const count = groups.reduce((s, g) => s + g.cells.length, 0);
  const colors = new Set(groups.map((g) => g.color)).size;
  const bonus =
    CHAIN_BONUS[Math.min(chain, CHAIN_BONUS.length) - 1] +
    groups.reduce((s, g) => s + GROUP_BONUS(g.cells.length), 0) +
    COLOR_BONUS[colors];
  return count * 10 * Math.min(999, Math.max(1, bonus));
}
