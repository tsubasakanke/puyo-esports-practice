import type { FrameInput } from '../engine/player';
import type { KeyBinds } from '../settings';

export type Action = keyof KeyBinds;

/** キーの状態を覚えて、1フレームぶんの入力にする。押した瞬間のフラグは sample() のたびにリセット */
export class Keyboard {
  private held = new Set<string>();
  private pressed = new Set<string>();
  private onDown = (e: KeyboardEvent) => {
    // 文字入力欄に打っているときはゲームの操作にしない
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    if (this.isBound(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.held.add(e.code);
    this.pressed.add(e.code);
  };
  private onUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };
  private onBlur = () => this.held.clear();

  constructor(private target: Window, public binds: KeyBinds) {
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
  }

  private isBound(code: string): boolean {
    return Object.values(this.binds).some((codes: string[]) => codes.includes(code));
  }

  isHeld(a: Action): boolean {
    return this.binds[a].some((c) => this.held.has(c));
  }

  /** 前回の sample() 以降に押されたか（メニュー操作用にも使う） */
  wasPressed(a: Action): boolean {
    return this.binds[a].some((c) => this.pressed.has(c));
  }

  /** 生のキーコードで押されたか（メニュー用: Enter など） */
  wasPressedCode(code: string): boolean {
    return this.pressed.has(code);
  }

  sample(): FrameInput {
    const input: FrameInput = {
      left: this.isHeld('left'),
      right: this.isHeld('right'),
      down: this.isHeld('down'),
      rotL: this.wasPressed('rotL'),
      rotR: this.wasPressed('rotR'),
    };
    return input;
  }

  /** 押した瞬間のフラグを消す。1 フレームの最後に呼ぶ */
  endFrame(): void {
    this.pressed.clear();
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onDown);
    this.target.removeEventListener('keyup', this.onUp);
    this.target.removeEventListener('blur', this.onBlur);
  }
}
