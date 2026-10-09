import { Texture } from 'pixi.js';
import type { Color } from '../engine/types';

/** 色ごとの [基本色, 明るい色, 暗い色(縁)] */
export const PUYO_COLORS: Record<number, [string, string, string]> = {
  1: ['#f2384a', '#ff8f96', '#8f0f22'],
  2: ['#3fd14a', '#9cf59a', '#14762a'],
  3: ['#2f7cf2', '#8fc0ff', '#10379a'],
  4: ['#f7cf2a', '#fff19a', '#a8740a'],
  5: ['#a54ce8', '#d9a3ff', '#541a8c'],
  6: ['#dfe4ee', '#ffffff', '#8a93a6'],
};

/** links のビット: 1=上, 2=右, 4=下, 8=左 */
export const LINK_UP = 1, LINK_RIGHT = 2, LINK_DOWN = 4, LINK_LEFT = 8;

function canvas(px: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  return [c, c.getContext('2d')!];
}

/** 本体の形（丸＋つながった方向への帯）をパスにする */
function bodyPath(ctx: CanvasRenderingContext2D, px: number, links: number, inset: number) {
  const c = px / 2;
  const r = px * 0.46 - inset;
  const band = px * 0.39 - inset;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  if (links & LINK_UP) ctx.rect(c - band, -1, band * 2, c + 1);
  if (links & LINK_DOWN) ctx.rect(c - band, c, band * 2, c + 1);
  if (links & LINK_LEFT) ctx.rect(-1, c - band, c + 1, band * 2);
  if (links & LINK_RIGHT) ctx.rect(c, c - band, c + 1, band * 2);
}

function drawPuyo(px: number, color: Color, links: number): HTMLCanvasElement {
  const [cv, ctx] = canvas(px);
  const [base, light, dark] = PUYO_COLORS[color];
  const c = px / 2;
  const garbage = color === 6;

  // 縁（暗い色）
  ctx.fillStyle = dark;
  bodyPath(ctx, px, links, 0);
  ctx.fill('nonzero');

  // 本体: 左上が明るい放射グラデーション
  const g = ctx.createRadialGradient(c * 0.7, c * 0.6, px * 0.04, c, c, px * 0.55);
  g.addColorStop(0, light);
  g.addColorStop(0.45, base);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  bodyPath(ctx, px, links, px * 0.035);
  ctx.fill('nonzero');

  // 下側のやわらかい影
  ctx.save();
  bodyPath(ctx, px, links, px * 0.035);
  ctx.clip('nonzero');
  const sh = ctx.createLinearGradient(0, c, 0, px);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(1, garbage ? 'rgba(40,50,80,0.25)' : 'rgba(0,0,0,0.28)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, c, px, c);
  // 上側のつや（全体にうっすら）
  const top = ctx.createLinearGradient(0, 0, 0, c);
  top.addColorStop(0, 'rgba(255,255,255,0.35)');
  top.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, px, c);
  ctx.restore();

  // ハイライト（左上の白い楕円＋小さい点）
  ctx.save();
  ctx.filter = `blur(${px * 0.012}px)`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(c - px * 0.14, c - px * 0.2, px * 0.13, px * 0.07, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(c - px * 0.27, c - px * 0.06, px * 0.03, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (garbage) {
    // おじゃまは半透明っぽく、中心に小さい模様
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    bodyPath(ctx, px, links, px * 0.08);
    ctx.fill('nonzero');
    ctx.globalCompositeOperation = 'source-over';
  }
  return cv;
}

/** オリジナルの目: 小さな黒いビーズの目にハイライト（原作の白目デザインとは別物） */
function drawEyes(px: number, color: Color, blink: boolean): HTMLCanvasElement {
  const [cv, ctx] = canvas(px);
  const c = px / 2;
  const ink = color === 6 ? '#4a5266' : '#1b1424';
  for (const side of [-1, 1]) {
    const ex = c + side * px * 0.13;
    const ey = c + px * 0.04;
    ctx.fillStyle = ink;
    ctx.beginPath();
    if (blink) {
      ctx.ellipse(ex, ey + px * 0.02, px * 0.065, px * 0.016, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(ex, ey, px * 0.055, px * 0.075, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    if (!blink) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(ex - px * 0.018, ey - px * 0.03, px * 0.02, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // ほっぺ
  if (color !== 6) {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(c + side * px * 0.25, c + px * 0.14, px * 0.06, px * 0.035, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return cv;
}

/** ぷよのテクスチャ一式。px は1マスの描画解像度（表示サイズの2倍くらいがきれい） */
export class PuyoTextures {
  private bodies = new Map<number, Texture>();
  private eyeTex = new Map<number, Texture>();

  constructor(readonly px: number) {
    for (const color of [1, 2, 3, 4, 5, 6] as Color[]) {
      for (let links = 0; links < 16; links++) {
        this.bodies.set(color * 16 + links, Texture.from(drawPuyo(px, color, color === 6 ? 0 : links)));
      }
      this.eyeTex.set(color * 2, Texture.from(drawEyes(px, color, false)));
      this.eyeTex.set(color * 2 + 1, Texture.from(drawEyes(px, color, true)));
    }
  }

  get(color: Color, links: number): Texture {
    return this.bodies.get(color * 16 + (links & 15))!;
  }

  eyes(color: Color, blink = false): Texture {
    return this.eyeTex.get(color * 2 + (blink ? 1 : 0))!;
  }
}
