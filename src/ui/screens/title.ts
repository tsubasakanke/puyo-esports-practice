import { Container, Sprite, Text } from 'pixi.js';
import type { App, Screen } from '../app';
import { Menu } from '../menu';
import { makeBackground } from '../../render/background';
import { BASE_W } from '../../render/layout';
import { FONT } from '../../render/hud';
import { PuyoTextures } from '../../render/puyoTextures';
import type { Color } from '../../engine/types';
import { SoloScreen } from './solo';
import { SettingsScreen } from './settings';

export class TitleScreen implements Screen {
  private app!: App;
  private menu!: Menu;
  private floaters: { s: Container; vy: number; ph: number }[] = [];

  enter(app: App): void {
    this.app = app;
    app.root.addChild(makeBackground('tsu'));

    const tex = new PuyoTextures(128);
    for (let i = 0; i < 14; i++) {
      const c = ((i % 5) + 1) as Color;
      const g = new Container();
      const body = new Sprite(tex.get(c, 0));
      const eyes = new Sprite(tex.eyes(c));
      for (const s of [body, eyes]) {
        s.anchor.set(0.5);
        s.width = s.height = 70 + (i % 3) * 25;
      }
      g.addChild(body, eyes);
      g.position.set(80 + ((i * 137) % 1760), 120 + ((i * 263) % 900));
      g.alpha = 0.55;
      app.root.addChild(g);
      this.floaters.push({ s: g, vy: 0.3 + (i % 4) * 0.15, ph: i });
    }

    const small = new Text({ text: 'ぷよぷよ eスポーツ', style: { fill: '#ffffff', fontSize: 54, fontWeight: '900', fontFamily: FONT, stroke: { color: '#1a3a8a', width: 12, join: 'round' } } });
    small.anchor.set(0.5);
    small.position.set(BASE_W / 2, 190);
    const big = new Text({
      text: 'れんしゅう場',
      style: {
        fill: '#ffe14a',
        fontSize: 132,
        fontWeight: '900',
        fontFamily: FONT,
        letterSpacing: 6,
        stroke: { color: '#c2410c', width: 18, join: 'round' },
        dropShadow: { color: '#000000', alpha: 0.45, blur: 6, distance: 8, angle: Math.PI / 2 },
      },
    });
    big.anchor.set(0.5);
    big.position.set(BASE_W / 2, 320);
    const note = new Text({ text: 'ファンメイドの非公式練習ツールです（SEGA とは関係ありません）', style: { fill: '#e8f4ff', fontSize: 22, fontFamily: FONT, fontWeight: '700' } });
    note.anchor.set(0.5);
    note.position.set(BASE_W / 2, 1040);

    this.menu = new Menu([
      { label: 'ひとり練習', onSelect: () => app.go(new SoloScreen()) },
      { label: 'CPU 対戦（じゅんび中）', disabled: true },
      { label: 'オンライン対戦（じゅんび中）', disabled: true },
      { label: '設定', onSelect: () => app.go(new SettingsScreen()) },
    ]);
    this.menu.position.set(BASE_W / 2 - 280, 500);
    const help = new Text({ text: '↑↓ で選んで Enter / X で決定', style: { fill: '#ffffff', fontSize: 24, fontFamily: FONT, fontWeight: '700' } });
    help.anchor.set(0.5);
    help.position.set(BASE_W / 2, 900);
    app.root.addChild(small, big, this.menu, help, note);
  }

  tick(): void {
    for (const f of this.floaters) {
      f.ph += 0.03;
      f.s.y -= f.vy;
      f.s.rotation = Math.sin(f.ph) * 0.1;
      if (f.s.y < -80) f.s.y = 1160;
    }
    this.menu.handle(this.app.keyboard);
    this.app.keyboard.endFrame();
  }

  leave(): void {}
}
