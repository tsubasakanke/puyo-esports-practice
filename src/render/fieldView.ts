import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { COLS, VISIBLE, type Drop } from '../engine/field';
import { type Dir, type PieceState } from '../engine/piece';
import type { Player } from '../engine/player';
import type { EngineEvent } from '../engine/events';
import { type Color, EMPTY, GARBAGE } from '../engine/types';
import { bounce, fallOffset, lerp, squash } from './anim';
import { LINK_DOWN, LINK_LEFT, LINK_RIGHT, LINK_UP, PUYO_COLORS, type PuyoTextures } from './puyoTextures';

const SQUASH_FRAMES = 10;
const BOUNCE_FRAMES = 12;
const ROTATE_FRAMES = 4;
const QUICK_FRAMES = 6;
const FLASH_FRAMES = 36;
const DEATH_FRAMES = 70;

interface CellAnim {
  /** 落下: 何段上から、いつ始まり、何F後に着地するか */
  fromRows: number;
  start: number;
  land: number;
  /** 上のぷよほど揺れを遅らせる */
  delay: number;
}

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

interface Popup {
  t: Text;
  start: number;
}

/** 1人分の盤面の描画。座標の原点は 12 段目の上端・1 列目の左端 */
export class FieldView extends Container {
  private board = new Container();
  private pieceLayer = new Container();
  private fx = new Container();
  private pool: { body: Sprite; eyes: Sprite }[] = [];
  private pieceSprites: { body: Sprite; eyes: Sprite; glow: Sprite }[] = [];
  private anims = new Map<number, CellAnim>();
  private squashAt = new Map<number, number>();
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private player: Player | null = null;
  private frame = 0;
  private prevPiece: PieceState | null = null;
  private curPiece: PieceState | null = null;
  private prevFall = 0;
  private curFall = 0;
  private rotateStart = -100;
  private rotateFrom: Dir = 0;
  private rotateFrames = ROTATE_FRAMES;
  private clearStart = -100;
  private deathStart = -1;
  private blinkSeed = Math.random() * 1000;

  constructor(private tex: PuyoTextures, readonly cell: number) {
    super();
    const mark = new Graphics();
    const cx = 2 * cell + cell / 2, cy = cell / 2, r = cell * 0.28;
    mark.moveTo(cx - r, cy - r).lineTo(cx + r, cy + r).moveTo(cx + r, cy - r).lineTo(cx - r, cy + r);
    mark.stroke({ color: 0xff3b5c, width: cell * 0.09, alpha: 0.55, cap: 'round' });
    this.addChild(mark, this.board, this.pieceLayer, this.fx);
    // 13 段目より上は半マスだけ見せる
    const mask = new Graphics().rect(0, -cell * 0.5, COLS * cell, (VISIBLE + 0.5) * cell).fill(0xffffff);
    this.addChild(mask);
    this.board.mask = mask;
    for (let i = 0; i < 2; i++) {
      const glow = new Sprite();
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.alpha = 0;
      const body = new Sprite();
      body.anchor.set(0.5);
      const eyes = new Sprite();
      eyes.anchor.set(0.5);
      this.pieceLayer.addChild(glow, body, eyes);
      this.pieceSprites.push({ body, eyes, glow });
    }
  }

  private key(x: number, y: number) {
    return y * 8 + x;
  }

  private px(x: number) {
    return (x - 1) * this.cell + this.cell / 2;
  }

  private py(y: number) {
    return (VISIBLE - y) * this.cell + this.cell / 2;
  }

  /** エンジンを 1 ステップ進めたあとに呼ぶ */
  update(p: Player): void {
    this.player = p;
    this.frame = p.frame;
    this.prevPiece = this.curPiece;
    this.prevFall = this.curFall;
    this.curPiece = p.piece ? { ...p.piece } : null;
    this.curFall = p.piece ? p.fallProgress : 0;
    for (const e of p.events) this.onEvent(e, p);
  }

  /** 新しいゲームを始めるときに呼ぶ */
  reset(): void {
    this.anims.clear();
    this.squashAt.clear();
    this.deathStart = -1;
    this.clearStart = -100;
    this.shakeStart = -100;
    this.prevPiece = this.curPiece = null;
    this.board.y = 0;
    this.board.rotation = 0;
    for (const p of this.particles) p.g.destroy();
    this.particles = [];
    for (const p of this.popups) p.t.destroy();
    this.popups = [];
  }

  private onEvent(e: EngineEvent, p: Player) {
    switch (e.t) {
      case 'spawn':
        this.prevPiece = null;
        break;
      case 'rotate':
        if (this.prevPiece) {
          this.rotateFrom = this.prevPiece.dir;
          this.rotateStart = this.frame;
          this.rotateFrames = e.quick ? QUICK_FRAMES : ROTATE_FRAMES;
        }
        break;
      case 'lock':
        for (const c of e.cells) this.squashAt.set(this.key(c.x, c.y), this.frame);
        break;
      case 'chigiri':
        this.addFalls(e.drops, p.rules.CHIGIRI_EXTRA[Math.min(e.maxDrop, p.rules.CHIGIRI_EXTRA.length - 1)] - 4);
        break;
      case 'fall':
        this.addFalls(e.drops, p.rules.DROP_BASE + p.rules.DROP_PER_ROW * (e.maxDrop - 1) - 6);
        break;
      case 'clear': {
        this.clearStart = this.frame;
        const [sx, sy] = e.groups[0].cells.reduce(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0]);
        const n = e.groups[0].cells.length;
        this.popup(e.chain, this.px(sx / n), this.py(sy / n));
        break;
      }
      case 'garbage': {
        // 列ごとに着地の速さが違う（実測の表）
        for (const d of e.drops) {
          const land = (p.rules.GARBAGE_LAND_FRAMES[d.x - 1] ?? 60) * 0.8;
          this.anims.set(this.key(d.x, d.to), { fromRows: d.from - d.to, start: this.frame, land, delay: 0 });
          this.squashAt.delete(this.key(d.x, d.to));
        }
        if (e.count >= 6) {
          this.shakeStart = this.frame + 40;
          this.shakeAmp = Math.min(1, e.count / 30) * this.cell * 0.18;
        }
        break;
      }
      case 'dead':
        this.deathStart = this.frame;
        break;
    }
  }

  private addFalls(drops: Drop[], total: number) {
    const max = Math.max(1, ...drops.map((d) => d.from - d.to));
    for (const d of drops) {
      const rows = d.from - d.to;
      const land = Math.max(3, total * Math.sqrt(rows / max));
      const delay = 0;
      this.anims.set(this.key(d.x, d.to), { fromRows: rows, start: this.frame, land, delay });
      this.squashAt.delete(this.key(d.x, d.to));
    }
  }

  private popup(chain: number, x: number, y: number) {
    const t = new Text({
      text: `${chain}れんさ!`,
      style: {
        fill: chain >= 7 ? '#ff6ad5' : chain >= 4 ? '#ffb02e' : '#ffe14a',
        fontSize: this.cell * (0.62 + Math.min(chain, 10) * 0.05),
        fontWeight: '900',
        fontFamily: 'system-ui, "Hiragino Maru Gothic ProN", "Hiragino Sans", sans-serif',
        stroke: { color: '#5a1a00', width: this.cell * 0.12, join: 'round' },
        dropShadow: { color: '#000000', alpha: 0.4, blur: 4, distance: 3, angle: Math.PI / 2 },
      },
    });
    t.anchor.set(0.5);
    t.position.set(Math.min(Math.max(x, this.cell * 1.6), this.cell * (COLS - 1.6)), y);
    this.fx.addChild(t);
    this.popups.push({ t, start: this.frame });
  }

  private burst(x: number, y: number, color: Color) {
    const tint = Number.parseInt(PUYO_COLORS[color][1].slice(1), 16);
    for (let i = 0; i < 8; i++) {
      const g = new Graphics().circle(0, 0, this.cell * (0.07 + Math.random() * 0.06)).fill(tint);
      g.position.set(x, y);
      const a = (Math.PI * 2 * i) / 8 + Math.random() * 0.5;
      const v = this.cell * (0.06 + Math.random() * 0.06);
      this.fx.addChild(g);
      this.particles.push({ g, vx: Math.cos(a) * v, vy: Math.sin(a) * v - this.cell * 0.04, life: 0, max: 26 + Math.random() * 10 });
    }
  }

  private links(x: number, y: number, c: Color, now: number): number {
    const p = this.player!;
    if (c === GARBAGE || y > VISIBLE) return 0;
    const same = (nx: number, ny: number) =>
      ny >= 1 && ny <= VISIBLE && nx >= 1 && nx <= COLS && p.field.get(nx, ny) === c && !this.isFalling(nx, ny, now);
    if (this.isFalling(x, y, now)) return 0;
    let l = 0;
    if (same(x, y + 1)) l |= LINK_UP;
    if (same(x + 1, y)) l |= LINK_RIGHT;
    if (same(x, y - 1)) l |= LINK_DOWN;
    if (same(x - 1, y)) l |= LINK_LEFT;
    return l;
  }

  private isFalling(x: number, y: number, now: number): boolean {
    const a = this.anims.get(this.key(x, y));
    return !!a && now - a.start < a.land;
  }

  private blink(x: number, y: number, now: number): boolean {
    const phase = (now + Math.sin(x * 12.9898 + y * 78.233 + this.blinkSeed) * 43758) % 240;
    return phase >= 0 && phase < 6;
  }

  /** 描画フレームごとに呼ぶ。alpha は前ステップからの補間率 */
  render(alpha: number): void {
    const p = this.player;
    if (!p) return;
    const now = this.frame + alpha;
    const cell = this.cell;

    // 盤面
    let used = 0;
    const clearing = new Set(p.clearing.map(([x, y]) => this.key(x, y)));
    const clearT = now - this.clearStart;
    if (clearing.size && this.frame - this.clearStart >= FLASH_FRAMES && !this.burstDone) {
      this.burstDone = true;
      for (const [x, y] of p.clearing) this.burst(this.px(x), this.py(y), p.field.get(x, y));
    }
    if (!clearing.size) this.burstDone = false;

    for (let y = 1; y <= 13; y++) {
      for (let x = 1; x <= COLS; x++) {
        const c = p.field.get(x, y);
        if (c === EMPTY) continue;
        const k = this.key(x, y);
        let s = this.pool[used];
        if (!s) {
          const body = new Sprite();
          body.anchor.set(0.5);
          const eyes = new Sprite();
          eyes.anchor.set(0.5);
          this.board.addChild(body, eyes);
          s = this.pool[used] = { body, eyes };
        }
        used++;
        s.body.visible = s.eyes.visible = true;
        s.body.texture = this.tex.get(c, this.links(x, y, c, now));
        s.eyes.texture = this.tex.eyes(c, this.blink(x, y, now));
        let ox = 0, oy = 0, sx = 1, sy = 1, alphaV = 1, tint = 0xffffff;

        const a = this.anims.get(k);
        if (a) {
          const el = now - a.start;
          if (el < a.land) oy = -fallOffset(a.fromRows, el, a.land) * cell;
          else {
            const t = (el - a.land) / BOUNCE_FRAMES;
            if (t >= 1) this.anims.delete(k);
            oy = -bounce(t) * cell;
            ({ sx, sy } = squash(Math.min(1, t * 1.2)));
          }
        }
        const sq = this.squashAt.get(k);
        if (sq !== undefined) {
          const t = (now - sq) / SQUASH_FRAMES;
          if (t >= 1) this.squashAt.delete(k);
          ({ sx, sy } = squash(t));
        }
        if (clearing.has(k)) {
          if (clearT < FLASH_FRAMES) {
            tint = Math.floor(clearT / 3) % 2 === 0 ? 0xffffff : 0xa0a0a0;
            alphaV = Math.floor(clearT / 3) % 2 === 0 ? 1 : 0.55;
          } else {
            const t = Math.min(1, (clearT - FLASH_FRAMES) / 10);
            sx = sy = 1 + t * 0.35;
            alphaV = 1 - t;
          }
        }
        // つぶれは下端を基準に
        const bx = this.px(x) + ox;
        const by = this.py(y) + oy + (cell / 2) * (1 - sy);
        for (const sp of [s.body, s.eyes]) {
          sp.position.set(bx, by);
          sp.width = cell * sx;
          sp.height = cell * sy;
          sp.alpha = alphaV;
          sp.tint = tint;
        }
      }
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i].body.visible = this.pool[i].eyes.visible = false;

    this.renderPiece(now, alpha);
    this.renderFx(now);

    // 負け: 盤面が崩れ落ちる
    // おじゃまが着地したときの揺れ
    const st = now - this.shakeStart;
    const shake = st >= 0 && st < 20 ? Math.sin(st * 1.9) * this.shakeAmp * (1 - st / 20) : 0;
    this.pieceLayer.y = this.fx.y = shake;
    if (this.deathStart >= 0) {
      const t = Math.min(1, (now - this.deathStart) / DEATH_FRAMES);
      this.board.y = t * t * cell * 16;
      this.board.alpha = 1 - t * 0.6;
    } else {
      this.board.y = shake;
      this.board.alpha = 1;
    }
  }

  private burstDone = false;
  private shakeStart = -100;
  private shakeAmp = 0;

  private renderPiece(now: number, alpha: number) {
    const cur = this.curPiece;
    const cell = this.cell;
    for (const s of this.pieceSprites) s.body.visible = s.eyes.visible = s.glow.visible = false;
    if (!cur) return;
    const prev = this.prevPiece ?? cur;
    const near = Math.abs(prev.x - cur.x) <= 1 && Math.abs(prev.y - cur.y) <= 2;
    const t = near ? alpha : 1;
    // 落下中は fallProgress でなめらかに下げる
    const fallPrev = prev.y - this.prevFall;
    const fallCur = cur.y - this.curFall;
    const ay = lerp(prev === cur ? fallCur : fallPrev, fallCur, t);
    const ax = lerp(prev.x, cur.x, Math.min(1, t * 1.6));
    // 回転は軸を中心に円弧で
    let angle = cur.dir * 90;
    const rt = (now - this.rotateStart) / this.rotateFrames;
    if (rt < 1) {
      let from = this.rotateFrom * 90;
      let diff = angle - from;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      if (Math.abs(diff) === 180) diff = 180;
      const e = 1 - (1 - rt) * (1 - rt);
      angle = from + diff * e;
    }
    const rad = (angle * Math.PI) / 180;
    const positions: [number, number, Color][] = [
      [ax, ay, cur.colors[0]],
      [ax + Math.sin(rad), ay + Math.cos(rad), cur.colors[1]],
    ];
    const pulse = 0.25 + 0.2 * Math.sin(now * 0.25);
    positions.forEach(([x, y, c], i) => {
      const s = this.pieceSprites[i];
      const X = this.px(x), Y = this.py(y);
      s.body.texture = this.tex.get(c, 0);
      s.eyes.texture = this.tex.eyes(c);
      for (const sp of [s.body, s.eyes, s.glow]) {
        sp.visible = Y > -cell * 0.9;
        sp.position.set(X, Y);
        sp.width = sp.height = cell;
      }
      if (i === 0) {
        // 軸ぷよはうっすら光る
        s.glow.texture = this.tex.get(c, 0);
        s.glow.alpha = pulse;
      } else s.glow.visible = false;
    });
  }

  private renderFx(now: number) {
    for (const p of this.particles) {
      p.life++;
      p.g.x += p.vx;
      p.g.y += p.vy;
      p.vy += this.cell * 0.006;
      p.g.alpha = 1 - p.life / p.max;
    }
    this.particles = this.particles.filter((p) => {
      if (p.life < p.max) return true;
      p.g.destroy();
      return false;
    });
    for (const pp of this.popups) {
      const t = (now - pp.start) / 60;
      const s = t < 0.15 ? 0.6 + (t / 0.15) * 0.6 : 1.2 - Math.min(0.2, (t - 0.15) * 2);
      pp.t.scale.set(s);
      pp.t.y -= 0.4;
      pp.t.alpha = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;
    }
    this.popups = this.popups.filter((pp) => {
      if (now - pp.start < 60) return true;
      pp.t.destroy();
      return false;
    });
  }
}
