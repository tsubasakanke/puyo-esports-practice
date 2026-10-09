import { Container, Text } from 'pixi.js';
import type { App, Screen } from '../app';
import { FixedLoop } from '../loop';
import { overlay } from '../htmlOverlay';
import type { Room, RoomInfo } from '../../net/room';
import { OnlineMatch } from '../../net/onlineMatch';
import { makeBackground, makeFrame } from '../../render/background';
import { FieldView } from '../../render/fieldView';
import { FONT, Hud } from '../../render/hud';
import { BASE_H, BASE_W, cardLayout, versusSide, type SideLayout } from '../../render/layout';
import { GarbageQueueView } from '../../render/garbageQueue';
import { TitleScreen } from './title';

const bigText = (text: string, size: number, fill: string, stroke: string) =>
  new Text({ text, style: { fill, fontSize: size, fontWeight: '900', fontFamily: FONT, stroke: { color: stroke, width: size * 0.14, join: 'round' }, dropShadow: { color: '#000000', alpha: 0.5, blur: 6, distance: 6, angle: Math.PI / 2 } } });

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** ほかの人が書いた名前は信用しない（文字列にして 12 文字まで） */
const nameOf = (v: unknown) => String((v as { name?: unknown } | undefined)?.name ?? 'プレイヤー').slice(0, 12);

interface Side {
  index: number;
  view: FieldView;
  hud: Hud;
  queue: GarbageQueueView;
  label: Text;
  stars: Text;
}

/** オンラインの部屋（待機・対戦・結果） */
export class OnlineRoomScreen implements Screen {
  private app!: App;
  private game = new Container();
  private sides: Side[] = [];
  private match: OnlineMatch | null = null;
  private round = -1;
  private loop!: FixedLoop;
  private center!: Text;
  private panel: HTMLDivElement | null = null;
  private off: (() => void) | null = null;
  private escAt = -1000;
  private roundOver = false;
  /** タブが隠れているときもゲームを進めるためのタイマー（描画ループが止まるため） */
  private hiddenTimer = 0;

  constructor(private room: Room) {}

  enter(app: App): void {
    this.app = app;
    app.root.addChild(makeBackground('tsu'), this.game);
    this.center = bigText('', 150, '#ffe14a', '#c2410c');
    this.center.anchor.set(0.5);
    this.center.position.set(BASE_W / 2, BASE_H / 2 - 60);
    this.center.visible = false;
    app.root.addChild(this.center);
    this.loop = new FixedLoop(
      () => this.step(),
      (a) => {
        for (const s of this.sides) {
          s.view.render(a);
          s.queue.tick();
        }
      },
      // タブが隠れて止まっていた時間（最大 10 秒）も追いつく。対戦相手の画面を待たせないため
      600,
    );
    this.hiddenTimer = window.setInterval(() => {
      if (document.hidden) this.loop.tick(performance.now());
    }, 200);
    this.loop.reset(performance.now());
    this.off = this.room.onChange(() => this.sync());
    this.sync();
  }

  /** 部屋の状態が変わったとき */
  private sync() {
    const { info } = this.room.state;
    if (info.state === 'playing' && info.round !== this.round && info.members.includes(this.room.myId)) this.setupRound(info);
    if (info.state === 'playing' && this.match && !this.room.hostGone) {
      this.hidePanel();
      this.checkRoundOver();
    } else {
      this.showPanel();
    }
    this.refreshStars();
  }

  private setupRound(info: RoomInfo) {
    this.match?.dispose();
    for (const c of this.game.removeChildren()) c.destroy({ children: true });
    this.sides = [];
    this.round = info.round;
    this.roundOver = false;
    const s = this.app.settings;
    const m = new OnlineMatch(this.room, info.round, info.seed, info.members, { DAS: s.das, ARR: Math.max(2, s.arr) });
    this.match = m;
    const n = info.members.length;
    // 2 人なら自分を左（1P）に。3〜4 人はメンバー順
    const order = n === 2 ? [m.myIndex, 1 - m.myIndex] : info.members.map((_, i) => i);
    const tex = this.app.textures(n === 2 ? 120 : 96, s.colorMarks);
    order.forEach((index, slot) => {
      const L: SideLayout = n === 2 ? versusSide(slot as 0 | 1) : cardLayout(slot, n);
      const uid = info.members[index];
      const frame = makeFrame(L.cell, slot);
      frame.position.set(L.field.x, L.field.y);
      const view = new FieldView(tex, L.cell);
      view.position.set(L.field.x, L.field.y);
      const name = nameOf(this.room.state.players[uid]) + (index === m.myIndex ? '（あなた）' : '');
      const hud = new Hud(tex, L, slot, name);
      const queue = new GarbageQueueView(this.app.garbageIcons(), L.cell);
      queue.position.set(L.garbage.x, L.garbage.y);
      const label = bigText('', L.cell * 1.5, '#ffffff', '#1a1f3a');
      label.anchor.set(0.5);
      label.position.set(L.field.x + L.cell * 3, L.field.y + L.cell * 5);
      label.visible = false;
      const stars = new Text({ text: '', style: { fill: '#ffe14a', fontSize: 30, fontWeight: '900', fontFamily: FONT, stroke: { color: '#5a2a00', width: 6, join: 'round' } } });
      stars.anchor.set(0.5);
      stars.position.set(L.name.x, L.name.y + 46);
      this.game.addChild(frame, view, queue, hud, label, stars);
      view.update(m.players[index]);
      hud.setNext(m.players[index].next(1), m.players[index].next(2));
      this.sides.push({ index, view, hud, queue, label, stars });
    });
    this.refreshStars();
  }

  private refreshStars() {
    const { info } = this.room.state;
    for (const side of this.sides) {
      const uid = info.members[side.index];
      const w = this.room.wins(uid);
      side.stars.text = '★'.repeat(w) + '☆'.repeat(Math.max(0, info.firstTo - w));
    }
  }

  /** 決着がついたら WIN / ばたんきゅ〜 を出す（あとから同時負けが届いたら DRAW に直す） */
  private checkRoundOver() {
    const m = this.match;
    if (!m) return;
    const lost = this.room.state.losses[this.round] ?? {};
    const members = m.members;
    const lostCount = members.filter((u) => lost[u]).length;
    if (lostCount < members.length - 1) return;
    this.roundOver = true;
    const winner = members.findIndex((u) => !lost[u]);
    for (const side of this.sides) {
      side.label.visible = true;
      if (lostCount === members.length) {
        side.label.text = 'DRAW';
        side.label.style.fill = '#ffffff';
      } else if (side.index === winner) {
        side.label.text = 'WIN';
        side.label.style.fill = '#ffe14a';
      } else {
        side.label.text = 'ばたんきゅ〜';
        side.label.style.fill = '#a8c8ff';
      }
    }
  }

  private showPanel() {
    const { info, players } = this.room.state;
    const me = players[this.room.myId];
    const list = Object.entries(players)
      .filter(([, p]) => p && typeof p === 'object')
      .sort((a, b) => Number(a[1].joinedAt) - Number(b[1].joinedAt));
    const finished = info.state === 'finished';
    const champ = finished ? info.members.find((u) => this.room.wins(u) >= info.firstTo) : undefined;
    const rows = list
      .map(([uid, p]) => `<div style="display:flex;justify-content:space-between;padding:6px 4px;border-bottom:1px solid #2a3570;opacity:${p.online ? 1 : 0.4}">
          <span>${esc(nameOf(p))}${uid === this.room.myId ? '（あなた）' : ''}${uid === info.hostId ? ' 👑' : ''}</span>
          <span style="color:${p.ready ? '#7dff9a' : '#8890a8'}">${p.online ? (p.ready ? '準備OK' : 'まだ') : '切断'}</span></div>`)
      .join('');
    const html = `
      <h2>${this.room.hostGone ? 'ホストが部屋を出ました' : finished ? (champ ? `${esc(nameOf(players[champ]))} の勝ち！` : '試合終了') : '部屋で待っています'}</h2>
      ${this.room.hostGone ? '<div class="err">ホストがいないと部屋を進められません。部屋を出て、新しく作り直してね</div>' : ''}
      <div style="text-align:center;font-size:18px">部屋コード</div>
      <div style="text-align:center;font-size:44px;letter-spacing:6px;color:#ffe14a">${this.room.id}</div>
      <div style="margin-top:8px">${rows}</div>
      <div class="note">${info.firstTo} 本先取・2〜4 人。全員が準備OKで始まります</div>
      <div class="row"><button id="or-ready">${me?.ready ? '準備OKを取り消す' : finished ? 'もう一回（準備OK）' : '準備OK'}</button></div>
      <div class="row"><button class="sub" id="or-copy">招待リンクをコピー</button><button class="sub" id="or-leave">部屋を出る</button></div>
      <div class="err" id="or-msg"></div>`;
    if (!this.panel) this.panel = overlay(html);
    else this.panel.innerHTML = html;
    if (this.sides.length) this.panel.classList.add('top');
    const $ = (id: string) => this.panel!.querySelector<HTMLButtonElement>(`#${id}`)!;
    $('or-ready').onclick = () => void this.room.setReady(!me?.ready);
    $('or-leave').onclick = () => this.leaveRoom();
    $('or-copy').onclick = async () => {
      const url = this.room.link(location.origin + location.pathname);
      try {
        await navigator.clipboard.writeText(url);
        $('or-msg').textContent = 'コピーしました！友達に送ってね';
      } catch {
        $('or-msg').textContent = url;
      }
    };
  }

  private hidePanel() {
    this.panel?.remove();
    this.panel = null;
  }

  private leaveRoom() {
    this.room.leave();
    this.app.go(new TitleScreen());
  }

  private step() {
    const kb = this.app.keyboard;
    const m = this.match;
    if (!m || this.room.state.info.state !== 'playing') {
      kb.endFrame();
      for (const side of this.sides) side.view.update(m!.players[side.index]);
      return;
    }
    const now = this.room.serverNow();
    const startAt = this.room.state.info.startAt;
    if (now < startAt) {
      this.center.visible = true;
      this.center.text = startAt - now > 500 ? 'READY' : 'GO!';
      kb.endFrame();
    } else if (this.roundOver || this.room.hostGone) {
      // 決着後は自分の盤面を止める（待ち時間に窒息して勝ちが消えないように）
      kb.endFrame();
      for (const p of m.players) p.events = [];
    } else {
      if (this.center.visible && now - startAt > 400) this.center.visible = false;
      const input = kb.sample();
      kb.endFrame();
      m.step(input);
      const sfx = this.app.sfx;
      for (const e of m.me.events) {
        if (e.t === 'move') sfx.move();
        else if (e.t === 'rotate') sfx.rotate();
        else if (e.t === 'lock') sfx.lock();
        else if (e.t === 'clear') sfx.chain(e.chain);
        else if (e.t === 'allClear') sfx.allClear();
        else if (e.t === 'dead') sfx.lose();
      }
    }
    for (const side of this.sides) {
      const p = m.players[side.index];
      side.view.update(p);
      side.hud.setNext(p.next(1), p.next(2));
      side.hud.setScore(p.score, p.frame);
      side.queue.set(m.pendingOf(side.index));
      for (const e of p.events) {
        if (e.t === 'clear') {
          const k = e.groups.reduce((a, g) => a + g.cells.length, 0);
          side.hud.showChainScore(k * 10, e.score / (k * 10), p.frame);
        }
      }
    }
    this.checkRoundOver();
  }

  tick(nowMs: number): void {
    const kb = this.app.keyboard;
    if (kb.wasPressedCode('Escape')) {
      // 対戦中のうっかりを防ぐため、Esc は 1 秒以内に 2 回で退出
      if (nowMs - this.escAt < 1000) return this.leaveRoom();
      this.escAt = nowMs;
    }
    if (!this.match) {
      if (kb.wasPressedCode('Enter')) void this.room.setReady(!this.room.state.players[this.room.myId]?.ready);
      kb.endFrame();
      return;
    }
    if (this.room.state.info.state !== 'playing' && kb.wasPressedCode('Enter')) {
      void this.room.setReady(!this.room.state.players[this.room.myId]?.ready);
    }
    this.loop.tick(nowMs);
  }

  leave(): void {
    clearInterval(this.hiddenTimer);
    this.off?.();
    this.match?.dispose();
    this.hidePanel();
  }
}
