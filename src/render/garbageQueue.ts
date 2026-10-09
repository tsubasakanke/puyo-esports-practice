import { Container, Sprite } from 'pixi.js';
import { queueIcons } from '../engine/garbage';
import type { GarbageIcons } from './garbageIcons';

/** フィールドの上に出す予告。原点はフィールドの左上（12 段目の上端）の 1 段上 */
export class GarbageQueueView extends Container {
  private total = -1;
  private sprites: Sprite[] = [];
  private changedAt = 0;
  private t = 0;

  constructor(private icons: GarbageIcons, private cell: number) {
    super();
  }

  set(total: number): void {
    if (total === this.total) return;
    const grew = total > this.total;
    this.total = total;
    for (const s of this.sprites) s.destroy();
    this.sprites = queueIcons(total).map((kind, i) => {
      const s = new Sprite(this.icons.get(kind));
      s.anchor.set(0.5);
      s.width = s.height = this.cell * 0.95;
      s.position.set(this.cell * (0.5 + i), this.cell * 0.5);
      this.addChild(s);
      return s;
    });
    if (grew) this.changedAt = this.t;
  }

  /** 描画フレームごと。増えたときにぽよんと弾ませる */
  tick(): void {
    this.t++;
    const k = (this.t - this.changedAt) / 14;
    const s = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.25 : 1;
    for (const sp of this.sprites) sp.scale.set((this.cell * 0.95 * s) / sp.texture.width);
  }
}
