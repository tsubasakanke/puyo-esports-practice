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

  clear(): void {
    this.stack = [];
  }
}
