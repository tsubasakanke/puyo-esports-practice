import { Container, Graphics, Text } from 'pixi.js';
import type { App, Screen } from '../app';
import { FixedLoop } from '../loop';
import { Menu } from '../menu';
import { Match } from '../../engine/match';
import { CpuController, CPU_LEVELS } from '../../ai/cpuController';
import { makeBackground, makeFrame } from '../../render/background';
import { FieldView } from '../../render/fieldView';
import { FONT, Hud } from '../../render/hud';
import { BASE_H, BASE_W, versusSide } from '../../render/layout';
import { GarbageQueueView } from '../../render/garbageQueue';
import type { EngineEvent } from '../../engine/events';
import { TitleScreen } from './title';
import { CpuSetupScreen } from './cpuSetup';

const READY_FRAMES = 60;
const GO_FRAMES = 30;
const ROUND_END_FRAMES = 150;

type Phase = 'ready' | 'play' | 'roundEnd' | 'matchEnd';

const bigText = (text: string, size: number, fill: string, stroke: string) =>
  new Text({ text, style: { fill, fontSize: size, fontWeight: '900', fontFamily: FONT, stroke: { color: stroke, width: size * 0.14, join: 'round' }, dropShadow: { color: '#000000', alpha: 0.5, blur: 6, distance: 6, angle: Math.PI / 2 } } });

interface Side {
  view: FieldView;
  hud: Hud;
  queue: GarbageQueueView;
  label: Text;
}

/** CPU との 2 人対戦（先取制） */
export class VersusScreen implements Screen {
  private app!: App;
  private match!: Match;
  private cpu!: CpuController;
  private sides: Side[] = [];
  private loop!: FixedLoop;
  private phase: Phase = 'ready';
  private timer = 0;
  private wins = [0, 0];
  private stars!: Text;
  private center!: Text;
  private pauseLayer = new Container();
  private pauseMenu!: Menu;
  private endLayer = new Container();
  private endMenu!: Menu;
  private paused = false;

  constructor(private level: number, private firstTo: number) {}

  enter(app: App): void {
    this.app = app;
    app.root.addChild(makeBackground('tsu'));
    const tex = app.textures(120, app.settings.colorMarks);
    const names = ['YOU', `CPU（${CPU_LEVELS[this.level - 1].name}）`];
    for (const i of [0, 1] as const) {
      const L = versusSide(i);
      const frame = makeFrame(L.cell, i);
      frame.position.set(L.field.x, L.field.y);
      const view = new FieldView(tex, L.cell);
      view.position.set(L.field.x, L.field.y);
      const hud = new Hud(tex, L, i, names[i]);
      const queue = new GarbageQueueView(app.garbageIcons(), L.cell);
      queue.position.set(L.garbage.x, L.garbage.y);
      const label = bigText('', 96, '#ffffff', '#1a1f3a');
      label.anchor.set(0.5);
      label.position.set(L.field.x + L.cell * 3, L.field.y + L.cell * 5);
      label.visible = false;
      app.root.addChild(frame, view, queue, hud, label);
      this.sides.push({ view, hud, queue, label });
    }
    this.stars = new Text({ text: '', style: { fill: '#ffe14a', fontSize: 44, fontWeight: '900', fontFamily: FONT, stroke: { color: '#5a2a00', width: 8, join: 'round' }, align: 'center' } });
    this.stars.anchor.set(0.5);
    this.stars.position.set(BASE_W / 2, 1000);
    this.center = bigText('', 150, '#ffe14a', '#c2410c');
    this.center.anchor.set(0.5);
    this.center.position.set(BASE_W / 2, BASE_H / 2 - 60);
    app.root.addChild(this.stars, this.center);

    this.pauseLayer.addChild(new Graphics().rect(0, 0, BASE_W, BASE_H).fill({ color: 0x000000, alpha: 0.6 }));
    const pt = bigText('ポーズ', 90, '#ffe14a', '#c2410c');
    pt.anchor.set(0.5);
    pt.position.set(BASE_W / 2, 330);
    this.pauseMenu = new Menu([
      { label: 'つづける', onSelect: () => this.setPaused(false) },
      { label: 'タイトルへ', onSelect: () => app.go(new TitleScreen()) },
    ]);
    this.pauseMenu.position.set(BASE_W / 2 - 280, 440);
    this.pauseLayer.addChild(pt, this.pauseMenu);
    this.pauseLayer.visible = false;

    this.endLayer.addChild(new Graphics().roundRect(BASE_W / 2 - 340, 360, 680, 420, 30).fill({ color: 0x0b1028, alpha: 0.92 }).stroke({ color: 0xffffff, width: 5 }));
    this.endMenu = new Menu([
      { label: 'もう一回', onSelect: () => app.go(new VersusScreen(this.level, this.firstTo)) },
      { label: '強さを変える', onSelect: () => app.go(new CpuSetupScreen()) },
      { label: 'タイトルへ', onSelect: () => app.go(new TitleScreen()) },
    ]);
    this.endMenu.position.set(BASE_W / 2 - 280, 470);
    this.endLayer.addChild(this.endMenu);
    this.endLayer.visible = false;
    app.root.addChild(this.endLayer, this.pauseLayer);

    this.loop = new FixedLoop(() => this.step(), (a) => {
      for (const s of this.sides) {
        s.view.render(a);
        s.queue.tick();
      }
    });
    this.newRound();
    this.loop.reset(performance.now());
  }

  private newRound() {
    const seed = Math.floor(Math.random() * 65536);
    const s = this.app.settings;
    // CPU（2P）は自分の DAS 設定に左右されないよう、標準の値で動く
    this.match = new Match({ players: 2, seed, playerRules: [{ DAS: s.das, ARR: Math.max(2, s.arr) }] });
    this.cpu = new CpuController(this.level, this.app.cpuThinker(), Math.random);
    this.sides.forEach((side, i) => {
      side.view.reset();
      side.view.update(this.match.players[i]);
      side.label.visible = false;
      side.queue.set(0);
    });
    this.phase = 'ready';
    this.timer = 0;
    this.refreshStars();
  }

  private refreshStars() {
    const row = (n: number) => '★'.repeat(n) + '☆'.repeat(Math.max(0, this.firstTo - n));
    this.stars.text = `${row(this.wins[0])}   WIN   ${row(this.wins[1])}`;
  }

  private setPaused(v: boolean) {
    this.paused = v;
    this.pauseLayer.visible = v;
    this.loop.reset(performance.now());
  }

  private onEvents(i: number, events: EngineEvent[]) {
    const sfx = this.app.sfx;
    const p = this.match.players[i];
    const side = this.sides[i];
    for (const e of events) {
      if (e.t === 'clear') {
        sfx.chain(e.chain);
        const n = e.groups.reduce((a, g) => a + g.cells.length, 0);
        side.hud.showChainScore(n * 10, e.score / (n * 10), p.frame);
      }
      if (i !== 0) continue;
      if (e.t === 'move') sfx.move();
      else if (e.t === 'rotate') sfx.rotate();
      else if (e.t === 'lock') sfx.lock();
      else if (e.t === 'allClear') sfx.allClear();
      else if (e.t === 'dead') sfx.lose();
    }
  }

  private step() {
    const kb = this.app.keyboard;
    const m = this.match;
    if (this.phase === 'ready') {
      this.timer++;
      this.center.visible = true;
      this.center.text = this.timer < READY_FRAMES ? 'READY' : 'GO!';
      kb.endFrame();
      if (this.timer >= READY_FRAMES + GO_FRAMES) {
        this.phase = 'play';
        this.center.visible = false;
      }
      return;
    }
    if (this.phase === 'play') {
      const human = kb.sample();
      kb.endFrame();
      m.step([human, this.cpu.input(m.players[1], m.players[0])]);
      m.players.forEach((p, i) => this.onEvents(i, p.events));
    } else {
      kb.endFrame();
      // 決着後もアニメ（崩れ落ち）は進める
      for (const p of m.players) p.events = [];
    }
    m.players.forEach((p, i) => {
      const side = this.sides[i];
      side.view.update(p);
      side.hud.setNext(p.next(1), p.next(2));
      side.hud.setScore(p.score, p.frame);
      side.queue.set(p.pendingTotal());
    });
    if (this.phase === 'play' && m.result) {
      const w = m.result.winner;
      if (w !== null) this.wins[w]++;
      this.sides.forEach((side, i) => {
        side.label.visible = true;
        if (w === null) {
          side.label.text = 'DRAW';
          side.label.style.fill = '#ffffff';
        } else if (i === w) {
          side.label.text = 'WIN';
          side.label.style.fill = '#ffe14a';
        } else {
          side.label.text = 'ばたんきゅ〜';
          side.label.style.fill = '#a8c8ff';
          side.label.style.fontSize = 64;
        }
      });
      this.refreshStars();
      this.phase = 'roundEnd';
      this.timer = 0;
      return;
    }
    if (this.phase === 'roundEnd' && ++this.timer >= ROUND_END_FRAMES) {
      const champ = this.wins.findIndex((n) => n >= this.firstTo);
      if (champ >= 0) {
        this.phase = 'matchEnd';
        this.center.visible = true;
        this.center.text = champ === 0 ? 'YOU WIN!' : 'CPU WIN…';
        this.center.y = 280;
        this.endLayer.visible = true;
      } else {
        this.sides.forEach((s) => (s.label.style.fontSize = 96));
        this.newRound();
      }
    }
  }

  tick(nowMs: number): void {
    const kb = this.app.keyboard;
    if (this.phase === 'matchEnd') {
      this.endMenu.handle(kb);
      kb.endFrame();
      this.loop.tick(nowMs);
      return;
    }
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
