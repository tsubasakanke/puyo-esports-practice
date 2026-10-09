import { Container, Graphics, Text } from 'pixi.js';
import type { App, Screen } from '../app';
import { FixedLoop } from '../loop';
import { PracticeHistory } from '../practiceHistory';
import { Player, type PlayerSnapshot } from '../../engine/player';
import { makeBackground, makeFrame } from '../../render/background';
import { FieldView } from '../../render/fieldView';
import { FONT, Hud } from '../../render/hud';
import { BASE_H, BASE_W, versusSide } from '../../render/layout';
import { Menu } from '../menu';
import { TitleScreen } from './title';
import { keyName } from './settings';

export { PracticeHistory };

const label = (text: string, size: number, fill = '#ffffff') =>
  new Text({ text, style: { fill, fontSize: size, fontWeight: '800', fontFamily: FONT, stroke: { color: '#0a0d1c', width: 6, join: 'round' } } });

/** ひとり練習。シード・色数を選べて、1手戻す・やり直しができる */
export class SoloScreen implements Screen {
  private app!: App;
  private player!: Player;
  private view!: FieldView;
  private hud!: Hud;
  private loop!: FixedLoop;
  private history = new PracticeHistory<PlayerSnapshot>();
  private info!: Text;
  private pauseLayer = new Container();
  private pauseMenu!: Menu;
  private paused = false;
  private maxChain = 0;
  private colors: 3 | 4 | 5 = 4;

  constructor(private seed = Math.floor(Math.random() * 65536)) {}

  enter(app: App): void {
    this.app = app;
    const L = versusSide(0);
    const tex = app.textures(L.cell * 2, app.settings.colorMarks);
    app.root.addChild(makeBackground('tsu'));
    const frame = makeFrame(L.cell, 0);
    frame.position.set(L.field.x, L.field.y);
    this.view = new FieldView(tex, L.cell);
    this.view.position.set(L.field.x, L.field.y);
    this.hud = new Hud(tex, L, 0, 'YOU');
    app.root.addChild(frame, this.view, this.hud);

    // 2P 側の場所に練習パネル
    const R = versusSide(1);
    const panel = new Container();
    panel.position.set(R.field.x - 40, R.field.y);
    panel.addChild(
      new Graphics().roundRect(0, 0, R.cell * 6 + 80, R.cell * 12, 28).fill({ color: 0x0b1028, alpha: 0.82 }).stroke({ color: 0xffffff, width: 4, alpha: 0.85 }),
    );
    const title = label('ひとり練習', 46, '#ffe14a');
    title.position.set(36, 28);
    this.info = label('', 30);
    this.info.style.lineHeight = 48;
    this.info.position.set(36, 110);
    panel.addChild(title, this.info);
    app.root.addChild(panel);

    // ポーズ
    this.pauseLayer.addChild(new Graphics().rect(0, 0, BASE_W, BASE_H).fill({ color: 0x000000, alpha: 0.6 }));
    const pt = label('ポーズ', 80, '#ffe14a');
    pt.anchor.set(0.5);
    pt.position.set(BASE_W / 2, 300);
    this.pauseMenu = new Menu([
      { label: 'つづける', onSelect: () => this.setPaused(false) },
      { label: '最初からやり直す', onSelect: () => (this.restart(this.seed), this.setPaused(false)) },
      { label: 'シードを入力', onSelect: () => this.askSeed() },
      { label: '', onSelect: () => this.cycleColors(), onLeftRight: () => this.cycleColors() },
      { label: 'タイトルへ', onSelect: () => app.go(new TitleScreen()) },
    ]);
    this.pauseMenu.position.set(BASE_W / 2 - 280, 400);
    this.pauseLayer.addChild(pt, this.pauseMenu);
    this.pauseLayer.visible = false;
    app.root.addChild(this.pauseLayer);

    this.loop = new FixedLoop(() => this.step(), (a) => this.view.render(a));
    this.restart(this.seed);
  }

  private restart(seed: number) {
    this.seed = seed;
    const s = this.app.settings;
    this.player = new Player({ seed, colors: this.colors, rules: { DAS: s.das, ARR: Math.max(2, s.arr) } });
    this.history.clear();
    this.maxChain = 0;
    this.view.reset();
    this.view.update(this.player);
    this.loop.reset(performance.now());
    this.refreshInfo();
  }

  private askSeed() {
    const v = window.prompt('シード（0〜65535）を入力。空なら新しいランダムなシード', String(this.seed));
    if (v === null) return;
    const n = v.trim() === '' ? Math.floor(Math.random() * 65536) : Number(v);
    if (Number.isInteger(n) && n >= 0 && n <= 65535) {
      this.restart(n);
      this.setPaused(false);
    }
  }

  private cycleColors() {
    this.colors = this.colors === 5 ? 3 : ((this.colors + 1) as 4 | 5);
    this.restart(this.seed);
    this.refreshPauseLabels();
  }

  private refreshPauseLabels() {
    this.pauseMenu.setLabel(3, `色数：◀ ${this.colors} 色 ▶`);
  }

  private setPaused(v: boolean) {
    this.paused = v;
    this.pauseLayer.visible = v;
    this.refreshPauseLabels();
    this.loop.reset(performance.now());
  }

  private undo() {
    const s = this.history.undoFor({ dead: this.player.phase === 'dead', hasPiece: this.player.piece !== null });
    if (!s) return;
    this.player.restore(s);
    this.view.reset();
    this.view.update(this.player);
  }

  private step() {
    const kb = this.app.keyboard;
    if (kb.wasPressed('undo')) this.undo();
    if (kb.wasPressed('restart')) this.restart(this.seed);
    const p = this.player;
    p.step(kb.sample());
    kb.endFrame();
    const sfx = this.app.sfx;
    for (const e of p.events) {
      if (e.t === 'spawn') this.history.push(p.snapshot());
      else if (e.t === 'move') sfx.move();
      else if (e.t === 'rotate') sfx.rotate();
      else if (e.t === 'lock') sfx.lock();
      else if (e.t === 'clear') {
        sfx.chain(e.chain);
        const n = e.groups.reduce((a, g) => a + g.cells.length, 0);
        this.hud.showChainScore(n * 10, e.score / (n * 10), p.frame);
      } else if (e.t === 'chainEnd') this.maxChain = Math.max(this.maxChain, e.chain);
      else if (e.t === 'allClear') sfx.allClear();
      else if (e.t === 'dead') sfx.lose();
    }
    this.view.update(p);
    this.hud.setNext(p.next(1), p.next(2));
    this.hud.setScore(p.score, p.frame);
    if (p.events.length) this.refreshInfo();
  }

  private refreshInfo() {
    const p = this.player;
    const b = this.app.settings.binds;
    const k = (codes: string[]) => codes.map(keyName).join('/');
    this.info.text = [
      `シード：${this.seed}（${this.colors}色）`,
      `手数：${Math.max(0, p.tsumoIndex)}　最大連鎖：${this.maxChain}`,
      p.phase === 'dead' ? 'ばたんきゅ〜！ U で1手戻す / R でやり直し' : '',
      '',
      `${k(b.rotL)} / ${k(b.rotR)}：回転　${k(b.down)}：落とす`,
      `${k(b.undo)}：1手戻す　${k(b.restart)}：最初から`,
      `${k(b.pause)}：ポーズ（シード・色数の変更）`,
    ].join('\n');
  }

  tick(nowMs: number): void {
    const kb = this.app.keyboard;
    if (this.paused) {
      if (kb.wasPressed('pause')) this.setPaused(false);
      else this.pauseMenu.handle(kb);
      kb.endFrame();
      return;
    }
    if (kb.wasPressed('pause')) {
      kb.endFrame();
      this.setPaused(true);
      return;
    }
    this.loop.tick(nowMs);
  }

  leave(): void {}
}
