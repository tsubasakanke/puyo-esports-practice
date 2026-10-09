/** 設置したときの「ぷにっ」: つぶれて横に広がり、揺れながら戻る。t=0..1 */
export function squash(t: number): { sx: number; sy: number } {
  if (t <= 0 || t >= 1) return { sx: 1, sy: 1 };
  const k = Math.sin(Math.PI * 2 * t) * (1 - t);
  return { sx: 1 + 0.25 * k, sy: 1 - 0.3 * k };
}

/** 着地後の小さなはね返り（マス単位、上向きが正）。t=0..1 */
export function bounce(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  return Math.abs(Math.sin(Math.PI * 2 * t)) * (1 - t) * 0.12;
}

/** 等加速度で落ちるときの、着地点からの高さ（マス）。elapsed が land 以上なら 0 */
export function fallOffset(rows: number, elapsed: number, land: number): number {
  if (elapsed >= land || land <= 0) return 0;
  if (elapsed <= 0) return rows;
  const r = elapsed / land;
  return rows * (1 - r * r);
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
