import { Container, Graphics, Text } from 'pixi.js';
import { FONT } from '../render/hud';
import type { Keyboard } from '../input/keyboard';

export interface MenuItem {
  label: string;
  disabled?: boolean;
  /** 左右キーで値を変える項目 */
  onLeftRight?: (dir: -1 | 1) => void;
  onSelect?: () => void;
}

/** キーボード（↑↓・Enter/X・左右）とマウスで選べる縦メニュー */
export class Menu extends Container {
  private index = 0;
  private rows: { bg: Graphics; text: Text }[] = [];

  constructor(private items: MenuItem[], private rowW = 560, private rowH = 76) {
    super();
    items.forEach((item, i) => {
      const bg = new Graphics();
      const text = new Text({ text: item.label, style: { fill: '#ffffff', fontSize: Math.round(rowH * 0.45), fontWeight: '800', fontFamily: FONT } });
      text.anchor.set(0.5);
      text.position.set(rowW / 2, i * (rowH + 14) + rowH / 2);
      bg.eventMode = 'static';
      bg.cursor = item.disabled ? 'default' : 'pointer';
      bg.on('pointerover', () => this.setIndex(i));
      bg.on('pointertap', () => {
        this.setIndex(i);
        this.select();
      });
      this.addChild(bg, text);
      this.rows.push({ bg, text });
    });
    this.redraw();
  }

  setLabel(i: number, label: string) {
    this.rows[i].text.text = label;
  }

  private setIndex(i: number) {
    if (this.index === i) return;
    this.index = i;
    this.redraw();
  }

  private redraw() {
    this.rows.forEach(({ bg, text }, i) => {
      const on = i === this.index;
      const dis = this.items[i].disabled;
      bg.clear()
        .roundRect(0, i * (this.rowH + 14), this.rowW, this.rowH, this.rowH / 2)
        .fill({ color: on ? 0xffffff : 0x0d1430, alpha: on ? 0.95 : 0.7 })
        .stroke({ color: on ? 0xffc23a : 0x5a6aa8, width: on ? 6 : 3 });
      text.style.fill = on ? (dis ? '#8890a8' : '#1a1f3a') : dis ? '#6a7290' : '#ffffff';
    });
  }

  private select() {
    const item = this.items[this.index];
    if (!item.disabled) item.onSelect?.();
  }

  /** 1 描画フレームぶんのキー入力を処理する */
  handle(kb: Keyboard): void {
    const n = this.items.length;
    if (kb.wasPressedCode('ArrowDown') || kb.wasPressedCode('KeyS')) this.setIndex((this.index + 1) % n);
    if (kb.wasPressedCode('ArrowUp') || kb.wasPressedCode('KeyW')) this.setIndex((this.index + n - 1) % n);
    const item = this.items[this.index];
    if (item.onLeftRight && !item.disabled) {
      if (kb.wasPressedCode('ArrowLeft')) item.onLeftRight(-1);
      if (kb.wasPressedCode('ArrowRight')) item.onLeftRight(1);
    }
    if (kb.wasPressedCode('Enter') || kb.wasPressedCode('Space') || kb.wasPressedCode('KeyX')) this.select();
  }
}
