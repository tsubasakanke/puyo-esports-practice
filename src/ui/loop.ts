const STEP_MS = 1000 / 60;
const MAX_STEPS = 30;
/** 浮動小数の誤差で1F取りこぼさないための余裕 */
const EPS = 1e-6;

/** 1/60 秒の固定ステップで step を呼び、描画には前後フレームの補間率 alpha を渡す */
export class FixedLoop {
  private last = 0;
  private acc = 0;

  constructor(private step: () => void, private render: (alpha: number) => void) {}

  reset(nowMs: number): void {
    this.last = nowMs;
    this.acc = 0;
  }

  tick(nowMs: number): void {
    this.acc += nowMs - this.last;
    this.last = nowMs;
    let n = 0;
    while (this.acc >= STEP_MS - EPS && n < MAX_STEPS) {
      this.step();
      this.acc -= STEP_MS;
      n++;
    }
    // 追いつけなかった分は捨てる（タブが裏に回っていたときなど）
    if (this.acc >= STEP_MS) this.acc = 0;
    this.render(Math.max(0, this.acc) / STEP_MS);
  }
}
