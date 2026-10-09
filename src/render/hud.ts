import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { Color } from '../engine/types';
import type { PuyoTextures } from './puyoTextures';
import { PLAYER_COLORS } from './background';
import type { SideLayout } from './layout';

export const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", system-ui, sans-serif';

class NextBox extends Container {
  private sprites: { body: Sprite; eyes: Sprite }[] = [];
  constructor(private tex: PuyoTextures, private cell: number, color: number, label: string) {
    super();
    const w = cell * 1.5, h = cell * 2.5;
    this.addChild(
      new Graphics().roundRect(-8, -8, w + 16, h + 16, 14).fill(0xffffff).roundRect(-4, -4, w + 8, h + 8, 11).fill(color).roundRect(0, 0, w, h, 9).fill(0x10142a),
    );
    if (label) {
      const t = new Text({ text: label, style: { fill: '#ffffff', fontSize: cell * 0.32, fontWeight: '900', fontFamily: FONT } });
      t.anchor.set(0.5, 1);
      t.position.set(w / 2, -10);
      this.addChild(t);
    }
    for (let i = 0; i < 2; i++) {
      const body = new Sprite();
      const eyes = new Sprite();
      body.anchor.set(0.5);
      eyes.anchor.set(0.5);
      body.width = body.height = eyes.width = eyes.height = cell;
      body.position.set(w / 2, h / 2 + (i === 0 ? cell / 2 : -cell / 2));
      eyes.position.copyFrom(body.position);
      this.addChild(body, eyes);
      this.sprites.push({ body, eyes });
    }
  }
  set(pair: [Color, Color]) {
    pair.forEach((c, i) => {
      this.sprites[i].body.texture = this.tex.get(c, 0);
      this.sprites[i].eyes.texture = this.tex.eyes(c);
      this.sprites[i].body.width = this.sprites[i].body.height = this.cell;
      this.sprites[i].eyes.width = this.sprites[i].eyes.height = this.cell;
    });
  }
}

/** 1 人分の NEXT・スコア・名前バー */
export class Hud extends Container {
  private next: NextBox;
  private next2: NextBox;
  private score: Text;
  private chainUntil = -1;

  constructor(tex: PuyoTextures, layout: SideLayout, player: number, name: string) {
    super();
    const color = PLAYER_COLORS[player % 4];
    this.next = new NextBox(tex, layout.cell, color, 'NEXT');
    this.next.position.set(layout.next.x, layout.next.y);
    this.next2 = new NextBox(tex, layout.cell * 0.78, color, '');
    this.next2.position.set(layout.next2.x, layout.next2.y);
    this.score = new Text({
      text: '00000000',
      style: {
        fill: '#ffffff',
        fontSize: layout.cell * 0.9,
        fontWeight: '900',
        fontFamily: FONT,
        letterSpacing: 4,
        stroke: { color: '#0a0d1c', width: 8, join: 'round' },
      },
    });
    this.score.anchor.set(0.5);
    this.score.position.set(layout.score.x, layout.score.y);
    const bar = new Graphics().roundRect(-200, -26, 400, 52, 26).fill({ color, alpha: 0.9 }).stroke({ color: 0xffffff, width: 4 });
    bar.position.set(layout.name.x, layout.name.y);
    const nameText = new Text({ text: name, style: { fill: '#ffffff', fontSize: 28, fontWeight: '800', fontFamily: FONT } });
    nameText.anchor.set(0.5);
    nameText.position.copyFrom(bar.position);
    this.addChild(this.next, this.next2, this.score, bar, nameText);
  }

  setNext(a: [Color, Color], b: [Color, Color]) {
    this.next.set(a);
    this.next2.set(b);
  }

  /** 連鎖中でなければスコア（8 桁）を出す */
  setScore(n: number, frame: number) {
    if (frame < this.chainUntil) return;
    this.score.text = String(Math.min(n, 99999999)).padStart(8, '0');
  }

  /** 連鎖中は「消した数×10 × 倍率」を出す */
  showChainScore(base: number, mult: number, frame: number) {
    this.score.text = `${base} × ${mult}`;
    this.chainUntil = frame + 50;
  }
}
