import { Texture } from 'pixi.js';
import type { IconKind } from '../engine/garbage';

function canvas(px: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  return [c, c.getContext('2d')!];
}

function blob(ctx: CanvasRenderingContext2D, px: number, r: number) {
  const c = px / 2;
  const g = ctx.createRadialGradient(c * 0.75, c * 0.7, px * 0.02, c, c, r * 1.1);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.55, '#dfe4ee');
  g.addColorStop(1, '#8a93a6');
  ctx.fillStyle = '#6b7488';
  ctx.beginPath();
  ctx.arc(c, c + r * 0.05, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, r * 0.93, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.ellipse(c - r * 0.32, c - r * 0.42, r * 0.28, r * 0.15, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a5266';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(c + s * r * 0.28, c + r * 0.08, r * 0.1, r * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, inner: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? inner : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function gold(ctx: CanvasRenderingContext2D, px: number) {
  const g = ctx.createLinearGradient(0, px * 0.15, 0, px * 0.85);
  g.addColorStop(0, '#fff6b0');
  g.addColorStop(0.5, '#ffd23a');
  g.addColorStop(1, '#d98a00');
  return g;
}

function draw(kind: IconKind, px: number): HTMLCanvasElement {
  const [cv, ctx] = canvas(px);
  const c = px / 2;
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'small':
      blob(ctx, px, px * 0.3);
      break;
    case 'large':
      blob(ctx, px, px * 0.46);
      break;
    case 'rock': {
      const pts = [[0.18, 0.62], [0.28, 0.3], [0.52, 0.18], [0.78, 0.3], [0.86, 0.6], [0.7, 0.84], [0.34, 0.86]];
      const g = ctx.createLinearGradient(0, px * 0.2, 0, px * 0.85);
      g.addColorStop(0, '#c9ccd6');
      g.addColorStop(1, '#5b6070');
      ctx.fillStyle = g;
      ctx.strokeStyle = '#3a3e4a';
      ctx.lineWidth = px * 0.05;
      ctx.beginPath();
      pts.forEach(([x, y]) => ctx.lineTo(x * px, y * px));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = px * 0.03;
      ctx.beginPath();
      ctx.moveTo(px * 0.34, px * 0.36);
      ctx.lineTo(px * 0.5, px * 0.28);
      ctx.stroke();
      break;
    }
    case 'star':
      ctx.fillStyle = gold(ctx, px);
      ctx.strokeStyle = '#a35a00';
      ctx.lineWidth = px * 0.05;
      star(ctx, c, c + px * 0.03, px * 0.44, px * 0.19);
      ctx.fill();
      ctx.stroke();
      break;
    case 'moon':
      ctx.fillStyle = gold(ctx, px);
      ctx.strokeStyle = '#a35a00';
      ctx.lineWidth = px * 0.05;
      ctx.beginPath();
      ctx.arc(c, c, px * 0.4, Math.PI * 0.35, Math.PI * 1.65, false);
      ctx.arc(c + px * 0.17, c - px * 0.04, px * 0.3, Math.PI * 1.55, Math.PI * 0.45, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case 'crown':
      ctx.fillStyle = gold(ctx, px);
      ctx.strokeStyle = '#a35a00';
      ctx.lineWidth = px * 0.05;
      ctx.beginPath();
      ctx.moveTo(px * 0.12, px * 0.78);
      ctx.lineTo(px * 0.12, px * 0.3);
      ctx.lineTo(px * 0.32, px * 0.52);
      ctx.lineTo(px * 0.5, px * 0.2);
      ctx.lineTo(px * 0.68, px * 0.52);
      ctx.lineTo(px * 0.88, px * 0.3);
      ctx.lineTo(px * 0.88, px * 0.78);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      for (const [x, col] of [[0.3, '#ff4a6a'], [0.5, '#3fa8ff'], [0.7, '#4ad06a']] as const) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(px * x, px * 0.66, px * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'comet': {
      const tail = ctx.createLinearGradient(px * 0.05, px * 0.95, px * 0.6, px * 0.4);
      tail.addColorStop(0, 'rgba(255,120,40,0)');
      tail.addColorStop(1, 'rgba(255,150,40,0.95)');
      ctx.fillStyle = tail;
      ctx.beginPath();
      ctx.moveTo(px * 0.02, px * 0.98);
      ctx.lineTo(px * 0.5, px * 0.36);
      ctx.lineTo(px * 0.66, px * 0.52);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff9a2e';
      ctx.strokeStyle = '#b33a00';
      ctx.lineWidth = px * 0.05;
      star(ctx, px * 0.62, px * 0.38, px * 0.32, px * 0.14);
      ctx.fill();
      ctx.stroke();
      break;
    }
  }
  return cv;
}

/** 予告アイコンのテクスチャ（オリジナルの絵） */
export class GarbageIcons {
  private tex = new Map<IconKind, Texture>();
  constructor(px: number) {
    for (const k of ['small', 'large', 'rock', 'star', 'moon', 'crown', 'comet'] as IconKind[]) this.tex.set(k, Texture.from(draw(k, px)));
  }
  get(kind: IconKind): Texture {
    return this.tex.get(kind)!;
  }
}
