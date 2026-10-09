const MAX = 200;

/** ひとり練習の「1手戻す」用。ツモが出るたびに状態を積む */
export class PracticeHistory<T> {
  private stack: T[] = [];

  get size(): number {
    return this.stack.length;
  }

  push(s: T): void {
    this.stack.push(s);
    if (this.stack.length > MAX) this.stack.shift();
  }

  peek(): T | undefined {
    return this.stack[this.stack.length - 1];
  }

  /**
   * 戻す先を返す。ふだんは今のツモの1つ前のツモが出た時点。
   * 負けたあと（dead=true）は、最後のツモが出た時点（負けた手をやり直す）。
   */
  undo(dead: boolean): T | undefined {
    if (dead) return this.peek();
    if (this.stack.length < 2) return undefined;
    this.stack.pop();
    return this.peek();
  }

  /**
   * 今の状態に合わせて戻す先を選ぶ。操作中のツモがない（置いたあとの連鎖中など）か負けたときは、
   * 置いた手をやり直す（最後のツモが出た時点へ）。操作中なら1つ前のツモへ。
   */
  undoFor(state: { dead: boolean; hasPiece: boolean }): T | undefined {
    return this.undo(state.dead || !state.hasPiece);
  }

  clear(): void {
    this.stack = [];
  }
}
