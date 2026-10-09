import { Container, Graphics, Ticker } from 'pixi.js';
import { BASE_H, BASE_W } from './layout';

export type RuleKind = 'tsu' | 'fever';

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** 背景。通は森の中、フィーバーはスタジアム。どちらもオリジナルの絵柄 */
export function makeBackground(rule: RuleKind): Container {
  const root = new Container();
  const r = rand(rule === 'tsu' ? 7 : 11);
  const sky = new Graphics();
  if (rule === 'tsu') {
    // 空〜森の奥のグラデーションを横帯の重ねで
    const stops = [0x9fe3d8, 0x5fbfb0, 0x2f8c84, 0x1d5c5f, 0x123c45, 0x0c2733];
    stops.forEach((c, i) => sky.rect(0, (BASE_H / stops.length) * i, BASE_W, BASE_H / stops.length + 2).fill(c));
    root.addChild(sky);
    // 奥の木（薄い）→ 手前の木（濃い）
    for (const [layer, color, alpha] of [[0, 0x2a7a6c, 0.7], [1, 0x1a5a52, 0.85], [2, 0x0e3b39, 1]] as const) {
      const g = new Graphics();
      const baseY = 520 + layer * 150;
      for (let i = 0; i < 14; i++) {
        const x = r() * BASE_W;
        const w = 140 + r() * 160 + layer * 40;
        const h = 300 + r() * 260;
        g.roundRect(x - w * 0.06, baseY - h * 0.2, w * 0.12, BASE_H, 8).fill({ color, alpha });
        g.ellipse(x, baseY - h * 0.45, w * 0.5, h * 0.42).fill({ color, alpha });
        g.ellipse(x - w * 0.3, baseY - h * 0.3, w * 0.35, h * 0.3).fill({ color, alpha });
        g.ellipse(x + w * 0.3, baseY - h * 0.32, w * 0.35, h * 0.3).fill({ color, alpha });
      }
      g.rect(0, baseY + 120, BASE_W, BASE_H).fill({ color, alpha });
      root.addChild(g);
    }
    // 木漏れ日
    const beams = new Graphics();
    for (let i = 0; i < 6; i++) {
      const x = 200 + r() * 1500;
      beams.poly([x, 0, x + 80, 0, x + 380, BASE_H, x + 160, BASE_H]).fill({ color: 0xfffbd0, alpha: 0.06 });
    }
    root.addChild(beams);
  } else {
    const stops = [0x1a0b3a, 0x2b0f55, 0x3d1260, 0x2a0a40, 0x14051f, 0x0a0210];
    stops.forEach((c, i) => sky.rect(0, (BASE_H / stops.length) * i, BASE_W, BASE_H / stops.length + 2).fill(c));
    root.addChild(sky);
    // 大型ビジョン
    const vision = new Graphics()
      .roundRect(BASE_W / 2 - 260, 60, 520, 260, 18)
      .fill({ color: 0x0c0420, alpha: 0.9 })
      .stroke({ color: 0x9a6bff, width: 6, alpha: 0.8 });
    root.addChild(vision);
    // スポットライト
    const spots = new Graphics();
    for (let i = 0; i < 5; i++) {
      const x = 150 + i * 400;
      spots.poly([x - 20, 0, x + 20, 0, x + 260 - i * 120, BASE_H, x - 140 - i * 40, BASE_H]).fill({ color: [0xff7ad9, 0x7ad7ff, 0xffe27a][i % 3], alpha: 0.07 });
    }
    root.addChild(spots);
    // 観客席の光
    const crowd = new Graphics();
    for (let i = 0; i < 260; i++) {
      crowd.circle(r() * BASE_W, 760 + r() * 320, 2 + r() * 4).fill({ color: [0xffffff, 0xff9ae6, 0x9ad8ff, 0xfff09a][i % 4], alpha: 0.25 + r() * 0.5 });
    }
    root.addChild(crowd);
  }
  // ゆっくり漂う光の粒
  const motes = new Container();
  const parts: { g: Graphics; vx: number; vy: number; ph: number }[] = [];
  for (let i = 0; i < 40; i++) {
    const g = new Graphics().circle(0, 0, 2 + r() * 5).fill({ color: rule === 'tsu' ? 0xfffad0 : 0xffd0f5, alpha: 0.5 });
    g.position.set(r() * BASE_W, r() * BASE_H);
    motes.addChild(g);
    parts.push({ g, vx: (r() - 0.5) * 0.3, vy: -0.15 - r() * 0.35, ph: r() * 6 });
  }
  root.addChild(motes);
  const tick = (t: Ticker) => {
    for (const p of parts) {
      p.ph += 0.02 * t.deltaTime;
      p.g.x += (p.vx + Math.sin(p.ph) * 0.2) * t.deltaTime;
      p.g.y += p.vy * t.deltaTime;
      p.g.alpha = 0.35 + Math.sin(p.ph * 1.3) * 0.25;
      if (p.g.y < -10) p.g.y = BASE_H + 10;
      if (p.g.x < -10) p.g.x = BASE_W + 10;
      if (p.g.x > BASE_W + 10) p.g.x = -10;
    }
  };
  Ticker.shared.add(tick);
  root.on('destroyed', () => Ticker.shared.remove(tick));
  return root;
}

export const PLAYER_COLORS = [0x2f7cf2, 0xf2457a, 0x3fc85a, 0xf5c22a];
const FIELD_FILL = [0x1b1f3d, 0x3a1626, 0x15301f, 0x332a10];

/** フィールドの枠。少し傾いたカードの上に、模様の帯つきの枠を重ねる。原点はフィールド内側の左上 */
export function makeFrame(cell: number, player: number): Container {
  const root = new Container();
  const w = cell * 6, h = cell * 12;
  const color = PLAYER_COLORS[player % 4];
  const pad = cell * 0.32;

  const card = new Graphics()
    .roundRect(-pad * 1.6, -pad * 1.6, w + pad * 3.2, h + pad * 3.2, 26)
    .fill({ color, alpha: 0.35 });
  card.pivot.set(w / 2, h / 2);
  card.position.set(w / 2, h / 2);
  card.rotation = player % 2 === 0 ? -0.025 : 0.025;
  root.addChild(card);

  const outer = new Graphics()
    .roundRect(-pad, -pad, w + pad * 2, h + pad * 2, 20)
    .fill(0xffffff)
    .roundRect(-pad + 5, -pad + 5, w + pad * 2 - 10, h + pad * 2 - 10, 16)
    .fill(color);
  root.addChild(outer);

  // 模様の帯（斜めのストライプ）
  const band = new Graphics();
  for (let i = -20; i < 60; i++) {
    const x = -pad + i * 18;
    band.poly([x, -pad, x + 9, -pad, x + 9 + h + pad * 2, h + pad, x + h + pad * 2, h + pad]).fill({ color: 0xffffff, alpha: 0.12 });
  }
  const bandMask = new Graphics().roundRect(-pad + 5, -pad + 5, w + pad * 2 - 10, h + pad * 2 - 10, 16).fill(0xffffff);
  band.mask = bandMask;
  root.addChild(band, bandMask);

  // フィールドの中: 暗い単色＋薄い模様
  const inner = new Graphics().roundRect(-4, -4, w + 8, h + 8, 10).fill(FIELD_FILL[player % 4]);
  root.addChild(inner);
  const pattern = new Graphics();
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 6; x++) if ((x + y) % 2 === 0) pattern.rect(x * cell, y * cell, cell, cell).fill({ color: 0xffffff, alpha: 0.025 });
  for (let i = 0; i < 5; i++) pattern.circle(w * 0.5, h * 0.55, cell * (1 + i * 0.9)).stroke({ color: 0xffffff, width: 2, alpha: 0.035 });
  root.addChild(pattern);
  return root;
}
